'use strict';

document.addEventListener('DOMContentLoaded', async () => {

    // ── Fetch fresh menu from DB before anything else ──
    async function loadFreshMenu() {
        try {
            const token = sessionStorage.getItem('vb_jwt');
            const res = await fetch('/api/menu', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success && data.data && data.data.length > 0) {
                localStorage.setItem('vb_menu', JSON.stringify(
                    data.data.map(item => ({
                        id: item._id,
                        name: item.name,
                        category: item.category,
                        price: item.price
                    }))
                ));
                console.log('[VoxBill] Menu refreshed from DB:', data.data.length, 'items');
            }
        } catch (err) {
            console.warn('[VoxBill] Could not refresh menu, using cached:', err.message);
        }
    }
    await loadFreshMenu();

    const micBtn = document.getElementById('micBtn');
    const micWrapper = document.getElementById('micWrapper');
    const micStatus = document.getElementById('micStatus');
    const micIcon = document.getElementById('micIcon');
    const liveTranscript = document.getElementById('liveTranscript');
    const transcriptBox = document.getElementById('transcriptBox');
    const formTable = document.getElementById('formTable');
    const formDiscount = document.getElementById('formDiscount');
    const itemsList = document.getElementById('itemsList');
    const itemCount = document.getElementById('itemCount');
    const clearBillBtn = document.getElementById('clearBillBtn');
    const saveOrderBtn = document.getElementById('saveOrderBtn');
    const invoiceItems = document.getElementById('invoiceItems');
    const invSubtotal = document.getElementById('invSubtotal');
    const invGrand = document.getElementById('invGrand');
    const invTable = document.getElementById('invTable');
    const invDate = document.getElementById('invDate');
    const invRestName = document.getElementById('invRestName');
    const invRestAddr = document.getElementById('invRestAddr');
    const nameEl = document.getElementById('formCustomerName');

    const urlParams = new URLSearchParams(
        window.location.search);
    const tableNum = urlParams.get('table');
    if (tableNum && formTable) {
        formTable.value = tableNum;
        if (!VoxAPI.isManager()) {
            formTable.readOnly = true;
            formTable.style.background =
                'rgba(255,255,255,0.02)';
        }
    }

    let orderItems = [];
    let actionHistory = [];
    let customerName = '';
    let orderNote = '';
    let isListening = false;
    let selectedLang = 'en-IN';
    let currentTotals = {
        subtotal: 0, discountAmt: 0,
        taxAmt: 0, grandTotal: 0
    };
    let recognition = null;
    let isSpeaking = false;
    let currentOrderId = null;  // Track backend order ID for draft/ordering

    // TWO STAGE MIC:
    // idle     = not started
    // askName  = listening for customer name
    // ordering = taking order items
    let micStage = 'idle';

    // ── Auto-sync order to backend ──────────────
    async function syncOrderToBackend(status) {
        if (!formTable || !formTable.value || formTable.value === '?') return;
        const tableNo = parseInt(formTable.value);
        const custLabel = customerName || (nameEl ? nameEl.value.trim() : '');
        const payload = {
            tableNumber: tableNo,
            customerName: custLabel,
            notes: orderNote,
            items: orderItems,
            status: status || 'ordering',
            subtotal: currentTotals.subtotal,
            discountAmt: currentTotals.discountAmt,
            gst: currentTotals.taxAmt,
            total: currentTotals.grandTotal
        };
        try {
            const res = await VoxAPI.saveOrder(payload);
            if (res.ok && res.data && res.data.data) {
                currentOrderId = res.data.data._id;
                // If we synced successfully, the customer name in DB might be different if it was a draft
                if (res.data.data.customerName && !customerName) {
                    customerName = res.data.data.customerName;
                    if (nameEl) nameEl.value = customerName;
                }
                console.log('[VoxBill] Order synced:', currentOrderId, 'status:', status || 'ordering');
            }
        } catch (e) {
            console.warn('[VoxBill] Order sync failed:', e.message);
        }
    }

    // ── Save as draft & reset UI ─────────────────
    async function saveDraftAndReset() {
        if (orderItems.length > 0 && formTable && formTable.value && formTable.value !== '?') {
            await syncOrderToBackend('draft');
        }
        const savedTable = formTable ? formTable.value : '';
        orderItems = [];
        customerName = '';
        orderNote = '';
        currentOrderId = null;
        micStage = 'idle';
        if (nameEl) nameEl.value = '';
        renderAll();
        return savedTable;
    }

    // ── Load draft order from backend ────────────
    async function loadDraftOrder(tableNum) {
        try {
            const res = await VoxAPI.getOrders('today');
            if (!res.ok || !res.data || !res.data.data) return false;
            const draft = res.data.data.find(o =>
                o.tableNumber === parseInt(tableNum) &&
                (o.status === 'draft' || o.status === 'ordering')
            );
            if (!draft) return false;
            // Populate UI
            currentOrderId = draft._id;
            orderItems = (draft.items || []).map(i => ({
                item: i.item, qty: i.qty, price: i.price, total: i.total
            }));
            customerName = draft.customerName || '';
            orderNote = draft.notes || '';
            if (nameEl) nameEl.value = customerName;
            if (formTable) formTable.value = draft.tableNumber;
            micStage = orderItems.length > 0 ? 'ordering' : 'idle';
            renderAll();
            return true;
        } catch (e) {
            console.warn('[VoxBill] Failed to load draft:', e.message);
            return false;
        }
    }

    // ── Check URL for resume param ───────────────
    const shouldResume = urlParams.get('resume');
    if (shouldResume === 'true' && tableNum) {
        loadDraftOrder(tableNum).then(loaded => {
            if (loaded) {
                feedback(`Resumed order for Table ${tableNum}`, 'success');
                micStatus.textContent = 'Tap to Add Items';
            }
        });
    }

    // ── Helpers ─────────────────────────────────

    function speak(text, onDone) {
        if (!window.speechSynthesis) {
            if (onDone) onDone();
            return;
        }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = selectedLang;
        u.rate = 1.0;
        u.pitch = 1.0;
        isSpeaking = true;
        if (recognition) {
            try { recognition.abort(); } catch (e) { }
        }
        u.onend = () => {
            isSpeaking = false;
            if (onDone) onDone();
        };
        window.speechSynthesis.speak(u);
    }

    function feedback(msg, type) {
        const existing = transcriptBox
            .querySelector('.voice-feedback');
        if (existing) existing.remove();
        if (!msg) return;
        const el = document.createElement('p');
        el.className =
            `voice-feedback voice-feedback--${type}`;
        el.textContent = msg;
        transcriptBox.appendChild(el);
    }

    function has(t) {
        const words = Array.from(arguments).slice(1);
        return words.some(w => t.includes(w));
    }

    function applySettings() {
        const s = VB.getSettings();
        if (invRestName)
            invRestName.textContent =
                s.restaurantName.toUpperCase();
        if (invRestAddr)
            invRestAddr.textContent = s.address;
        if (invDate)
            invDate.textContent =
                new Date().toLocaleDateString('en-IN');
    }
    applySettings();

    function renderAll(newItems) {
        newItems = newItems || [];
        if (!itemsList) return;

        if (orderItems.length === 0) {
            itemsList.innerHTML =
                '<div class="empty-items">' +
                '<p>No items added.</p></div>';
        } else {
            itemsList.innerHTML = orderItems
                .map((item, idx) => {
                    const isNew = newItems.some(
                        n => n.item === item.item);
                    return `
                    <div class="item-row${isNew
                            ? ' item-row--added' : ''}">
                        <span class="ir-name">
                            ${item.item}</span>
                        <span class="ir-qty">
                            x${item.qty}</span>
                        <span class="ir-price">
                            ₹${item.total}</span>
                        <button class="ir-del"
                            onclick="window.removeItem(
                            ${idx})">
                            <i class="fa-solid fa-xmark">
                            </i></button>
                    </div>`;
                }).join('');
        }

        if (itemCount)
            itemCount.textContent =
                `${orderItems.length} items`;

        const subtotal = orderItems.reduce(
            (s, i) => s + i.total, 0);
        const discPct = formDiscount
            ? (parseFloat(formDiscount.value) || 0)
            : 0;
        const discAmt = (subtotal * discPct) / 100;
        const s = VB.getSettings();
        const gstEnabled = s.gstEnabled !== false;
        const gstRate = (s.gstPercent || 5) / 100;
        const afterDisc = subtotal - discAmt;
        const taxAmt = gstEnabled
            ? afterDisc * gstRate : 0;
        const grand = afterDisc + taxAmt;
        currentTotals = {
            subtotal, discountAmt: discAmt,
            taxAmt, grandTotal: grand
        };

        if (invTable)
            invTable.textContent =
                formTable.value || '--';
        if (invSubtotal)
            invSubtotal.textContent =
                `₹${subtotal.toFixed(2)}`;
        if (invGrand)
            invGrand.textContent =
                `₹${grand.toFixed(2)}`;
        if (invoiceItems) {
            invoiceItems.innerHTML = orderItems
                .map(i =>
                    `<tr><td>${i.item}</td>
                    <td class="center">${i.qty}</td>
                    <td class="right">
                    ₹${i.total}</td></tr>`)
                .join('');
        }
    }

    // ── Voice Recognition Setup ──────────────────

    const SpeechAPI = window.SpeechRecognition
        || window.webkitSpeechRecognition;

    if (micBtn) {
        if (!SpeechAPI) {
            micStatus.textContent = 'Not Supported';
            micBtn.addEventListener('click', () => {
                VB.showToast(
                    'Use Chrome or Edge for voice.',
                    'error');
            });
        } else {
            recognition = new SpeechAPI();
            recognition.continuous = false;
            recognition.interimResults = true;

            micBtn.addEventListener('click', () => {
                if (isSpeaking) {
                    window.speechSynthesis.cancel();
                    isSpeaking = false;
                }
                if (isListening) {
                    recognition.stop();
                    return;
                }
                if (micStage === 'idle' ||
                    (!customerName &&
                        orderItems.length === 0)) {
                    startNameStage();
                } else {
                    startOrderStage();
                }
            });

            recognition.onstart = () => {
                isListening = true;
                micWrapper.classList.add('listening');
                micIcon.className = 'fa-solid fa-stop';
            };

            recognition.onresult = e => {
                const text = Array.from(e.results)
                    .map(r => r[0].transcript)
                    .join('');
                liveTranscript.textContent = text;
                liveTranscript.classList.remove(
                    'placeholder');
                if (e.results[0].isFinal) {
                    if (micStage === 'askName') {
                        handleNameInput(text.trim());
                    } else {
                        processOrder(text);
                    }
                }
            };

            recognition.onend = () => {
                isListening = false;
                micWrapper.classList.remove(
                    'listening');
                micIcon.className =
                    'fa-solid fa-microphone';
                if (micStage === 'askName') {
                    micStatus.textContent =
                        'Say customer name...';
                } else {
                    micStatus.textContent =
                        'Tap to Add Items';
                }
            };

            recognition.onerror = e => {
                if (e.error === 'not-allowed') {
                    VB.showToast(
                        'Microphone access denied!',
                        'error');
                }
            };
        }
    }

    // ── STAGE 1: Collect customer name ───────────

    function startNameStage() {
        micStage = 'askName';
        micStatus.textContent = 'Say customer name...';
        feedback(
            'Listening for customer name...', 'info');
        speak('What is the customer name?', () => {
            recognition.lang = selectedLang;
            try { recognition.start(); }
            catch (e) {
                VB.showToast(
                    'Mic error. Check permissions.',
                    'error');
            }
        });
    }

    function handleNameInput(name) {
        const cleaned = name
            .replace(/\b(the|is|my|name|customer|it's|its|am|i am|this is)\b/gi, '')
            .trim();

        customerName = cleaned
            .split(' ')
            .filter(w => w.length > 0)
            .map(w => w.charAt(0).toUpperCase()
                + w.slice(1))
            .join(' ');

        if (nameEl) nameEl.value = customerName;

        micStage = 'ordering';
        micStatus.textContent = 'Tap to Add Items';

        speak(
            `Taking order for ${customerName}. ` +
            `Go ahead, tap mic and speak your items.`);

        feedback(
            `✅ Customer: ${customerName} — ` +
            `Tap mic to add items`,
            'success');

        VB.showToast(
            `Customer: ${customerName}`, 'success');

        const tableNo = formTable && formTable.value ? `Table ${formTable.value}` : 'a table';
        VB.addNotification(`New order session started for ${customerName} at ${tableNo}`, 'info');
    }

    // ── STAGE 2: Take order items ────────────────

    async function startOrderStage() {
        // Auto-load if we have a table but no order ID yet
        if (!currentOrderId && formTable && formTable.value && formTable.value !== '?') {
            await loadDraftOrder(formTable.value);
        }
        micStage = 'ordering';
        micStatus.textContent = 'Listening...';
        recognition.lang = selectedLang;
        try { recognition.start(); }
        catch (e) {
            VB.showToast(
                'Mic error. Check permissions.',
                'error');
        }
    }

    // ════════════════════════════════════════════
    //  PROCESS ORDER
    // ════════════════════════════════════════════

    async function processOrder(text) {
        const t = text.toLowerCase().trim().replace(/[.,!?]/g, '');
        const menu = VB.getMenu();
        const tableInfo = formTable && formTable.value
            ? ` for Table ${formTable.value}` : '';
        const custName = customerName;

        // ── INTRO / SYSTEM COMMANDS ──────────────
        if (has(t, 'what is your name', 'who are you', 'are you voxbill', 'what is voxbill ai',
            'who built you', 'who made you', 'what do you do', 'what is your work', 'how do you work',
            'how can you help', 'what can you do for my restaurant', 'what commands do you understand',
            'which languages do you support', 'introduce yourself', 'tell me about yourself',
            'how do waiters use you', 'how do managers use you', 'why should i use voxbill')) {

            let reply = '';
            if (has(t, 'your name', 'are you voxbill', 'what is voxbill')) {
                reply = 'I am the voice assistant of VoxBill.';
            } else if (has(t, 'who built you', 'who made you')) {
                reply = 'I am built by Rishi Charadva.';
            } else if (has(t, 'what do you do', 'introduce yourself', 'about yourself', 'why should i use')) {
                reply = 'My work is to take restaurant orders by voice and make billing easier for restaurant owners and waiters.';
            } else if (has(t, 'how do you work', 'how do waiters use', 'how do managers use')) {
                reply = 'I work by listening to voice commands, understanding orders, and helping manage tables, billing, staff, and menu operations.';
            } else if (has(t, 'how can you help', 'what commands')) {
                reply = 'I can help with taking orders, checking table status, managing bills, tracking staff, and answering restaurant workflow questions.';
            } else if (has(t, 'languages')) {
                reply = 'I support English, Hindi, and Gujarati voice interaction.';
            } else {
                reply = 'I am the voice assistant of VoxBill. I am here to help you manage the restaurant.';
            }

            speak(reply);
            feedback(reply, 'info');
            return;
        }

        // ── UNDO COMMAND ─────────────────────────
        if (has(t, 'undo last action', 'undo', 'pichla hatao', 'last wala hatao')) {
            if (actionHistory.length > 0) {
                const prevState = actionHistory.pop();
                orderItems = prevState.items;
                if (prevState.hasOwnProperty('customerName')) customerName = prevState.customerName;
                if (prevState.hasOwnProperty('orderNote')) orderNote = prevState.orderNote;
                if (nameEl) nameEl.value = customerName;
                renderAll();
                await syncOrderToBackend('ordering');
                speak('Undid the last action.');
                feedback('Last action undone.', 'info');
            } else {
                speak('Nothing to undo.');
                feedback('No previous actions to undo.', 'error');
            }
            return;
        }

        // ── SET CUSTOMER NAME ────────────────────
        const setCustMatch = t.match(/(?:set|change)?\s*(?:customer\s*name|name)\s*(?:to|is)\s+([a-z\s]+)/i);
        if (setCustMatch) {
            actionHistory.push({ items: JSON.parse(JSON.stringify(orderItems)), customerName: customerName, orderNote: orderNote });
            const newName = setCustMatch[1].trim()
                .split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
            customerName = newName;
            if (nameEl) nameEl.value = customerName;
            await syncOrderToBackend('ordering');
            speak(`Customer name set to ${customerName}`);
            feedback(`Customer name updated: ${customerName}`, 'success');
            return;
        }

        // ── SPECIAL NOTE ─────────────────────────
        const noteMatch = t.match(/(?:add|set|put\s*down|write)?\s*(?:special\s+)?(?:note|comment|remark|message)\s+(.+)/i);
        if (noteMatch) {
            actionHistory.push({ items: JSON.parse(JSON.stringify(orderItems)), customerName: customerName, orderNote: orderNote });
            orderNote = noteMatch[1].trim()
                .split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');

            // Assuming there's a noteEl or we just show feedback
            await syncOrderToBackend('ordering');
            speak(`Note added: ${orderNote}`);
            feedback(`Special note saved: ${orderNote}`, 'success');
            return;
        }

        // ── MENU QUERIES ─────────────────────────
        if (has(t, 'what items are in menu', 'read menu', 'menu batao', 'menu mein kya hai')) {
            const cats = [...new Set(menu.map(m => m.category || 'Other'))];
            speak(`Menu has ${menu.length} items across categories like ${cats.slice(0, 3).join(', ')}.`);
            feedback(`Menu: ${menu.length} items (${cats.join(', ')})`, 'info');
            return;
        }

        const priceMatch = t.match(/(?:price|cost|rate)\s*(?:of|for)?\s+(.+)/i);
        if (priceMatch) {
            const itemName = priceMatch[1].trim();
            const found = menu.find(m => m.name.toLowerCase().includes(itemName) || itemName.includes(m.name.toLowerCase()));
            if (found) {
                speak(`Price of ${found.name} is ${found.price} rupees.`);
                feedback(`₹${found.price} - ${found.name}`, 'info');
            } else {
                speak(`Sorry, I couldn't find ${itemName} in the menu.`);
                feedback(`${itemName} not found`, 'error');
            }
            return;
        }

        const availMatch = t.match(/is\s+(.+?)\s+(?:available|there)/i) || t.match(/(?:do you have|hai kya)\s+(.+)/i);
        if (availMatch && !has(t, 'price', 'cost', 'table', 'tables')) {
            const itemName = availMatch[1].trim().replace(/\?$/, '');
            const found = menu.find(m => m.name.toLowerCase().includes(itemName) || itemName.includes(m.name.toLowerCase()));
            if (found) {
                speak(`Yes, ${found.name} is available for ${found.price} rupees.`);
                feedback(`Available: ${found.name}`, 'info');
            } else {
                speak(`No, we don't have that item in the menu.`);
                feedback(`Not available`, 'error');
            }
            return;
        }

        const changeQtyMatch = t.match(/change\s+(?:quantity|qty)\s*(?:of)?\s+(.+?)\s+to\s+(\d+)/i) ||
            t.match(/(.+?)\s+(?:ki\s+)?quantity\s+(\d+)\s+kar\s+do/i) ||
            t.match(/(.+?)\s+ni\s+quantity\s+(\d+)\s+kari\s+de/i);
        if (changeQtyMatch) {
            actionHistory.push({ items: JSON.parse(JSON.stringify(orderItems)), customerName: customerName });
            let targetItem = changeQtyMatch[1].trim();
            let newQty = parseInt(changeQtyMatch[2], 10);
            let foundIdx = orderItems.findIndex(i => targetItem.includes(i.item.toLowerCase()) || i.item.toLowerCase().includes(targetItem));
            if (foundIdx >= 0) {
                orderItems[foundIdx].qty = newQty;
                orderItems[foundIdx].total = orderItems[foundIdx].price * newQty;
                renderAll();
                await syncOrderToBackend('ordering');
                speak(`Changed quantity of ${orderItems[foundIdx].item} to ${newQty}.`);
                feedback(`Quantity updated: ${newQty}x ${orderItems[foundIdx].item}`, 'success');
            } else {
                speak('Item not found in current order.');
                feedback('Item not found', 'error');
            }
            return;
        }

        const addMoreMatch = t.match(/add\s+(\d+)\s+more\s+(.+)/i) ||
            t.match(/(\d+)\s+(?:aur|bija)\s+(.+?)(?:\s+(?:lao|do|aapo|add kar))?$/i);
        if (addMoreMatch) {
            actionHistory.push({ items: JSON.parse(JSON.stringify(orderItems)), customerName: customerName });
            let addQty = parseInt(addMoreMatch[1], 10);
            let targetItem = addMoreMatch[2].trim();
            let foundIdx = orderItems.findIndex(i => targetItem.includes(i.item.toLowerCase()) || i.item.toLowerCase().includes(targetItem));
            if (foundIdx >= 0) {
                orderItems[foundIdx].qty += addQty;
                orderItems[foundIdx].total = orderItems[foundIdx].price * orderItems[foundIdx].qty;
                renderAll();
                await syncOrderToBackend('ordering');
                speak(`Added ${addQty} more ${orderItems[foundIdx].item}.`);
                feedback(`Added more: ${addQty}x ${orderItems[foundIdx].item}`, 'success');
            } else {
                // If not in order, maybe we route it back through the AI or standard add logic.
                // For safety, we can just say "not found, say add [item] [qty]"
                speak(`${targetItem} is not in the order yet. Please add it normally.`);
                feedback(`Not in order`, 'error');
            }
            return;
        }

        // ── REMOVE / DELETE ──────────────────────
        if (has(t, 'remove', 'delete',
            'take off', 'take out', 'hatao',
            'nikalo', 'kadhi nakh', 'kadh', 'cancel kar')) {

            actionHistory.push({ items: JSON.parse(JSON.stringify(orderItems)), customerName: customerName });

            const qtyMatch = t.match(/\b(\d+)\b/);
            const qtyToRemove = qtyMatch
                ? parseInt(qtyMatch[1]) : null;
            const removed = [];
            const newItems = [];

            // Provide safer matching to avoid partial match false positives
            for (const item of orderItems) {
                // strict bound check or contains all words
                const itemWords = item.item.toLowerCase().split(' ');
                const textWords = t.split(' ');
                let isMatch = itemWords.some(w => textWords.includes(w)) || t.includes(item.item.toLowerCase());

                // More strict regex boundary check for the item name
                const escapedItem = item.item.toLowerCase().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const strictRegex = new RegExp(`\\b${escapedItem}\\b`, 'i');
                const wordMatch = strictRegex.test(t);

                if (wordMatch) {
                    if (qtyToRemove &&
                        item.qty > qtyToRemove) {
                        newItems.push({
                            ...item,
                            qty: item.qty - qtyToRemove,
                            total: item.price *
                                (item.qty - qtyToRemove)
                        });
                        removed.push({
                            ...item,
                            qty: qtyToRemove
                        });
                    } else {
                        removed.push(item);
                    }
                } else {
                    newItems.push(item);
                }
            }

            if (removed.length > 0) {
                orderItems = newItems;
                const names = removed.map(i =>
                    `${i.qty} ${i.item}`).join(', ');
                renderAll();
                await syncOrderToBackend('ordering');
                feedback('Removed: ' + names, 'info');
                speak('Removed ' + names);
            } else {
                feedback(
                    'Item not found in order.',
                    'error');
                speak(
                    'Item not found in current order.');
            }
            return;
        }

        // ── UPDATE / CHANGE ──────────────────────
        if (has(t, 'update', 'change', 'replace',
            'switch', 'badlo', 'badal do', 'badli nakh', 'change kar')) {

            actionHistory.push({ items: JSON.parse(JSON.stringify(orderItems)), customerName: customerName });

            const toMatch = t.match(
                /(?:update|change|replace|switch|badlo|badal\s+do|badli\s+nakh|change\s+kar)\s+(.+?)\s+(?:to|with|se|na\s+badle|ni\s+jagyae)\s+(.+)/);

            if (toMatch) {
                const fromName = toMatch[1].trim();
                const toNameRaw = toMatch[2].trim();
                const qtyMatch =
                    toNameRaw.match(/\b(\d+)\b/);
                const newQty = qtyMatch
                    ? parseInt(qtyMatch[1]) : null;
                const toName = toNameRaw
                    .replace(/\b\d+\b/, '').trim();

                const oldIdx = orderItems.findIndex(
                    i => i.item.toLowerCase().includes(fromName) || fromName.includes(i.item.toLowerCase())
                );
                const newMenuItem = menu.find(m =>
                    m.name.toLowerCase().includes(toName) || toName.includes(m.name.toLowerCase())
                );

                if (oldIdx === -1) {
                    feedback(
                        `${fromName} not in order`,
                        'error');
                    speak(
                        `${fromName} is not in ` +
                        `the current order`);
                    return;
                }
                if (!newMenuItem) {
                    feedback(
                        `${toName} not found in menu`,
                        'error');
                    speak(
                        `${toName} not found in menu`);
                    return;
                }

                const qty = newQty
                    || orderItems[oldIdx].qty;
                const oldName =
                    orderItems[oldIdx].item;
                orderItems[oldIdx] = {
                    item: newMenuItem.name,
                    qty: qty,
                    price: newMenuItem.price,
                    total: newMenuItem.price * qty
                };
                renderAll();
                await syncOrderToBackend('ordering');
                feedback(
                    `Updated: ${oldName} → ` +
                    `${qty}× ${newMenuItem.name}`,
                    'success');
                speak(
                    `Updated ${oldName} to ` +
                    `${qty} ${newMenuItem.name}`);
            } else {
                feedback(
                    'Say: update [item] to [new item]',
                    'error');
                speak(
                    'Say update, then item name, ' +
                    'then to, then new item name.');
            }
            return;
        }

        // ── CLEAR ORDER ──────────────────────────
        if (has(t, 'clear order', 'clear all',
            'sab clear', 'start over',
            'reset order', 'sab hatao', 'naya order',
            'badhu kadhi nakh', 'navo order', 'clear kar')) {
            actionHistory.push({ items: JSON.parse(JSON.stringify(orderItems)), customerName: customerName, orderNote: orderNote });
            orderItems = [];
            customerName = '';
            orderNote = '';
            currentOrderId = null;
            micStage = 'idle';
            if (nameEl) nameEl.value = '';
            renderAll();
            feedback('Order cleared.', 'info');
            speak(
                'Order cleared. Tap mic to start ' +
                'a new order.');
            micStatus.textContent = 'Tap to Start';
            return;
        }

        // ── SAVE DRAFT ───────────────────────────
        if (has(t, 'save draft', 'save this order',
            'mark this table pending', 'keep this order pending',
            'draft save karo', 'order save karo',
            'draft rakho', 'pending rakho')) {
            if (orderItems.length === 0) {
                feedback('No items to save as draft.', 'error');
                speak('Order is empty. Nothing to save.');
                return;
            }
            if (!formTable.value || formTable.value === '?') {
                feedback('Table number missing.', 'error');
                speak('Please set a table number first.');
                return;
            }
            const tbl = formTable.value;
            await saveDraftAndReset();
            speak(`Table ${tbl} order saved as draft.`);
            feedback(`Table ${tbl} saved as draft. You can resume later.`, 'success');
            micStatus.textContent = 'Tap to Start';
            return;
        }

        // ── SWITCH TABLE ─────────────────────────
        const switchTableMatch = t.match(/(?:new table|switch to table|take table|table switch)\s*(\d+)/i);
        if (switchTableMatch) {
            const newTable = switchTableMatch[1];
            if (orderItems.length > 0 && formTable && formTable.value) {
                const oldTable = formTable.value;
                await saveDraftAndReset();
                feedback(`Table ${oldTable} saved as draft.`, 'info');
            }
            if (formTable) {
                formTable.value = newTable;
                if (!VoxAPI.isManager()) {
                    formTable.readOnly = true;
                }
            }
            // Try to load existing draft for new table
            const loaded = await loadDraftOrder(newTable);
            if (loaded) {
                speak(`Resumed draft order for table ${newTable}.`);
                feedback(`Resumed draft for Table ${newTable}`, 'success');
            } else {
                micStage = 'idle';
                speak(`Switched to table ${newTable}. Tap mic to start order.`);
                feedback(`Table ${newTable} — ready for new order.`, 'info');
            }
            micStatus.textContent = 'Tap to Start';
            return;
        }

        // ── RESUME DRAFT ─────────────────────────
        const resumeMatch = t.match(/(?:open draft|continue|resume|lo|reopen)\s*(?:table)?\s*(\d+)/i) || 
                           t.match(/(?:table)?\s*(\d+)\s*(?:ka order kholo|no order chalu karo|kolo)/i);
        if (resumeMatch) {
            const rTable = resumeMatch[1];
            // Auto-save current if needed
            if (orderItems.length > 0 && formTable && formTable.value && formTable.value !== rTable) {
                await saveDraftAndReset();
            }
            const loaded = await loadDraftOrder(rTable);
            if (loaded) {
                speak(`Resumed draft order for table ${rTable}.`);
                feedback(`Resumed: Table ${rTable} — ${orderItems.length} items`, 'success');
            } else {
                speak(`No draft found for table ${rTable}.`);
                feedback(`No draft for Table ${rTable}`, 'error');
            }
            return;
        }

        // ── SEND TO MANAGER ──────────────────────
        if (has(t, 'send order', 'order send',
            'manager ko bhejo', 'send to manager',
            'order ready', 'manager ne moklo',
            'billing ke liye bhejo', 'bill mate moklo',
            'ready for billing', 'bill ready',
            'manager ke paas bhejo')) {
            if (orderItems.length === 0) {
                feedback(
                    'No items in order yet.', 'error');
                speak(
                    'Order is empty. ' +
                    'Please add items first.');
                return;
            }
            if (!formTable.value ||
                formTable.value === '?') {
                feedback(
                    'Table number missing.', 'error');
                speak('Table number is missing.');
                return;
            }
            saveOrderBtn.click();
            return;
        }

        // ── REPEAT LAST ITEM ─────────────────────
        if (has(t, 'repeat', 'same again',
            'ek aur', 'wahi lao', 'one more',
            'dubara lao', 'same do', 'e j lav', 'pharithi', 'fari thi')) {
            if (orderItems.length === 0) {
                feedback(
                    'No items to repeat.', 'error');
                speak('No items to repeat.');
                return;
            }
            actionHistory.push({ items: JSON.parse(JSON.stringify(orderItems)), customerName: customerName });

            const last =
                orderItems[orderItems.length - 1];
            // Fix: Repeat the last item with its actual quantity
            const repeated = {
                item: last.item,
                qty: last.qty,
                price: last.price,
                total: last.price * last.qty
            };

            // Check if already in array to combine quantities
            const existing = orderItems.find(o => o.item === repeated.item);
            if (existing) {
                existing.qty += repeated.qty;
                existing.total += repeated.total;
                renderAll([repeated]);
            } else {
                orderItems.push(repeated);
                renderAll([repeated]);
            }

            feedback(
                `✅ Repeated: ${last.qty}x ${last.item}`,
                'success');
            speak(`Added ${last.qty} more ${last.item}`);
            return;
        }

        // ── TOTAL AMOUNT ─────────────────────────
        if (has(t, 'total kitna', 'kitna hua',
            'total amount', 'total bolo',
            'bill kitna', 'ketlu thayu', 'bill ketlu thayu', 'total ketlo')) {
            if (orderItems.length === 0) {
                speak('Order is empty.');
                feedback('Order is empty.', 'info');
                return;
            }
            const total = orderItems.reduce(
                (s, i) => s + i.total, 0);
            const grand =
                currentTotals.grandTotal || total;
            speak(
                `Subtotal is ${total} rupees. ` +
                `Grand total with GST is ` +
                `${Math.round(grand)} rupees.`);
            feedback(
                `Subtotal: ₹${total} | ` +
                `Total with GST: ` +
                `₹${Math.round(grand)}`,
                'info');
            return;
        }

        // ── ITEM COUNT ───────────────────────────
        if (has(t, 'kitne item', 'how many items',
            'total items', 'tell me total items',
            'items count', 'kitne hain', 'ketli item chhe', 'ketli items aavi')) {
            const count = orderItems.length;
            const msg = count === 0
                ? 'Order is empty.'
                : `${count} item type` +
                `${count > 1 ? 's' : ''} in order.`;
            speak(msg);
            feedback(msg, 'info');
            return;
        }

        // ── WHAT IS THE ORDER ────────────────────
        if (has(t, 'what is the order',
            'what is order', 'tell me the order',
            'order kya hai', 'order batao',
            'order dikhao', 'order list',
            'order mein kya',
            'abhi tak kya liya', 'kya order hai')) {

            if (orderItems.length === 0) {
                speak(
                    'Order is empty. ' +
                    'No items added yet.');
                feedback('Order is empty.', 'info');
                return;
            }

            const forMatch = t.match(
                /(?:for|of|customer)\s+([a-z]+)/i);
            const askedName = forMatch
                ? forMatch[1] : null;

            if (askedName && custName &&
                !custName.toLowerCase().includes(
                    askedName.toLowerCase())) {
                speak(
                    `This order is for ${custName}, ` +
                    `not ${askedName}.`);
                feedback(
                    `Order is for ${custName}`,
                    'info');
                return;
            }

            const itemList = orderItems.map(i =>
                `${i.qty} ${i.item}`).join(', ');
            const total = orderItems.reduce(
                (s, i) => s + i.total, 0);
            const grand =
                currentTotals.grandTotal || total;
            const tableNo = formTable
                ? formTable.value : '';
            const custLabel = custName
                ? ` for ${custName}` : '';
            const tableLabel = tableNo
                ? ` on Table ${tableNo}` : '';

            speak(
                `Order${custLabel}${tableLabel}: ` +
                `${itemList}. ` +
                `Subtotal ${total} rupees. ` +
                `Total with GST ` +
                `${Math.round(grand)} rupees.`);
            feedback(
                `${custName
                    ? custName + ' | ' : ''}` +
                `${itemList} | ` +
                `Total: ₹${Math.round(grand)}`,
                'info');
            return;
        }

        // ── SET TABLE NUMBER ─────────────────────
        const setTableMatch = t.match(
            /^(?:set\s+)?table\s*(?:number\s*)?(\d+)$/i);
        if (setTableMatch) {
            const tNum = setTableMatch[1];
            if (formTable) {
                formTable.value = tNum;
                speak(`Table number set to ${tNum}`);
                feedback(
                    `Table: ${tNum}`, 'success');
            }
            return;
        }

        // ── SET ITEM QUANTITY ────────────────────
        const setQtyMatch = t.match(
            /(?:make|set)\s+(.+?)\s+(?:quantity\s+(?:to\s+)?)?(\d+)/i);
        if (setQtyMatch) {
            const itemName = setQtyMatch[1]
                .toLowerCase().trim();
            const newQty = parseInt(setQtyMatch[2]);
            const found = orderItems.find(i => {
                const iName = i.item.toLowerCase();
                return iName.includes(itemName)
                    || itemName.includes(iName);
            });
            if (found && newQty > 0) {
                actionHistory.push({
                    items: JSON.parse(
                        JSON.stringify(orderItems)),
                    customerName: customerName
                });
                found.qty = newQty;
                found.total = found.price * newQty;
                renderAll();
                speak(
                    `${found.item} quantity set to ` +
                    `${newQty}`);
                feedback(
                    `${found.item}: ${newQty}x`,
                    'success');
            } else if (!found) {
                speak(
                    `${itemName} is not in the ` +
                    `current order`);
                feedback(
                    `Item not found in order`,
                    'error');
            }
            return;
        }

        // ── SHOW MENU ITEMS ─────────────────────
        if (has(t, 'show menu items',
            'menu items', 'list menu')) {
            const menu = VB.getMenu();
            if (menu.length === 0) {
                speak('Menu is empty.');
                feedback('Menu is empty.', 'info');
                return;
            }
            // Group by category
            const cats = {};
            menu.forEach(m => {
                const c = m.category || 'Other';
                if (!cats[c]) cats[c] = [];
                cats[c].push(m.name);
            });
            const summary = Object.entries(cats)
                .map(([c, items]) =>
                    `${c}: ${items.join(', ')}`)
                .join('. ');
            speak(
                `Menu has ${menu.length} items. ` +
                `${summary}`);
            feedback(
                `Menu: ${menu.length} items`,
                'info');
            return;
        }

        // ── HELP ────────────────────────────────
        if (has(t, 'help', 'commands',
            'what can you do', 'kya bol sakta',
            'commands batao')) {
            speak(
                'Try saying Hey Nova, Hey Voxi, ' +
                'or Hey VB to activate voice. ' +
                'Then say: 2 butter naan, ' +
                'remove paneer, repeat, undo, ' +
                'total amount, clear order, ' +
                'send to manager, set table 5, ' +
                'customer name Rahul, ' +
                'or any item name to add.');
            feedback(
                'Say Hey Nova / Voxi / VB '+
                'to start, then use: ' +
                'add | remove | repeat ' +
                '| undo | total | clear...',
                'info');
            return;
        }

        // ── GUARD MANAGER COMMANDS ───────────────
        if (has(t, 'revenue', 'analytics', 'report', 'invoice', 'receipt', 'discount', 'gst ', 'tax ', 'print bill', 'whatsapp bill', 'share bill', 'available tables', 'free tables')) {
            speak('This command is available only in manager mode.');
            feedback('Manager mode only.', 'error');
            return;
        }

        // ── ADD ITEMS via AI ─────────────────────
        micStatus.textContent = 'Analyzing...';
        micWrapper.classList.add('analyzing');
        feedback('', '');

        try {
            actionHistory.push({ items: JSON.parse(JSON.stringify(orderItems)), customerName: customerName });

            const res = await fetch('/order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text,
                    token: sessionStorage.getItem(
                        'vb_jwt') || ''
                })
            });
            const data = await res.json();

            if (data.items && data.items.length > 0) {

                if (data.tableNumber) {
                    formTable.value =
                        data.tableNumber;
                    VB.showToast(
                        `Table ${data.tableNumber} ` +
                        `detected!`);
                }

                const matched = [];
                const unmatched = [];

                for (const aiItem of data.items) {
                    const itemName = aiItem.item
                        .toLowerCase().trim();

                    let menuItem = menu.find(m =>
                        m.name.toLowerCase().trim()
                        === itemName);

                    if (!menuItem) {
                        menuItem = menu.find(m =>
                            m.name.toLowerCase()
                                .includes(itemName) ||
                            itemName.includes(
                                m.name.toLowerCase()));
                    }

                    if (menuItem) {
                        const qty = aiItem.qty || 1;
                        const existing =
                            orderItems.findIndex(
                                o => o.item ===
                                    menuItem.name);
                        if (existing >= 0) {
                            orderItems[existing]
                                .qty += qty;
                            orderItems[existing]
                                .total =
                                orderItems[existing]
                                    .price *
                                orderItems[existing]
                                    .qty;
                            matched.push(
                                orderItems[existing]);
                        } else {
                            matched.push({
                                item: menuItem.name,
                                qty: qty,
                                price: menuItem.price,
                                total: menuItem.price
                                    * qty
                            });
                        }
                    } else {
                        unmatched.push(aiItem.item);
                    }
                }

                if (unmatched.length > 0) {
                    VB.showToast(
                        `Not in menu: ` +
                        `${unmatched.join(', ')}`,
                        'error');
                }

                if (matched.length === 0) {
                    feedback(
                        'No menu items recognized.',
                        'error');
                    speak(
                        'No items matched the menu. ' +
                        'Please try again.');
                    return;
                }

                matched.forEach(m => {
                    const exists = orderItems.find(
                        o => o.item === m.item);
                    if (!exists) orderItems.push(m);
                });

                const itemNames = matched.map(i =>
                    `${i.qty}× ${i.item}`).join(', ');
                const custLabel = custName
                    ? ` for ${custName}` : '';
                feedback(
                    `✅ Added: ${itemNames}${tableInfo}`,
                    'success');
                renderAll(matched);

                // Auto-sync to backend so manager sees this table as 'ordering'
                syncOrderToBackend('ordering');

                const summary = matched.map(i =>
                    `${i.qty} ${i.item}`)
                    .join(' and ');
                speak(
                    `Added ${summary}` +
                    `${tableInfo}${custLabel}.`);
                VB.showToast(
                    `✅ ${matched.length} item(s) ` +
                    `added${tableInfo}`);

            } else {
                feedback(
                    'Command not recognized. ' +
                    'Try again.', 'error');
                speak(
                    'Could not recognize items. ' +
                    'Please say item name ' +
                    'and quantity.');
            }
        } catch (e) {
            VB.showToast('Connection error', 'error');
            feedback('❌ Connection error.', 'error');
            console.error(e);
        } finally {
            micStatus.textContent = 'Tap to Add Items';
            micWrapper.classList.remove('analyzing');
        }
    }

    window.removeItem = (idx) => {
        orderItems.splice(idx, 1);
        renderAll();
    };

    saveOrderBtn.addEventListener('click',
        async () => {
            if (orderItems.length === 0)
                return VB.showToast('No items', 'error');
            if (!formTable.value ||
                formTable.value === '?')
                return VB.showToast(
                    'Select/Mention Table', 'error');

            const tableNo = formTable.value;
            const custLabel = customerName
                || (nameEl ? nameEl.value.trim() : '');

            const payload = {
                tableNumber: parseInt(tableNo),
                customerName: custLabel,
                notes: orderNote,
                items: orderItems,
                status: 'ready_for_billing',
                subtotal: currentTotals.subtotal,
                discountAmt: currentTotals.discountAmt,
                gst: currentTotals.taxAmt,
                total: currentTotals.grandTotal
            };

            // Use saveOrder which will upsert (PATCH existing or create new)
            const res = await VoxAPI.saveOrder(payload);
            if (res.ok) {
                speak(
                    `Order for Table ${tableNo}` +
                    `${custLabel
                        ? ' for ' + custLabel : ''}` +
                    ` sent to manager.`);
                VB.showToast(
                    `Order for Table ${tableNo} sent!`,
                    'success');
                VB.addNotification(
                    `Table ${tableNo} is ready ` +
                    `for billing`, 'priority');
                orderItems = [];
                customerName = '';
                orderNote = '';
                currentOrderId = null;
                micStage = 'idle';
                if (nameEl) nameEl.value = '';
                renderAll();
                setTimeout(() => {
                    window.location.href =
                        '../pages/tables.html';
                }, 1500);
            } else {
                VB.showToast(
                    res.data.message ||
                    'Error sending order', 'error');
            }
        });

    // Save Draft Button
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    if (saveDraftBtn) {
        saveDraftBtn.addEventListener('click', async () => {
            if (orderItems.length === 0) return VB.showToast('No items to draft', 'error');
            if (!formTable.value || formTable.value === '?') return VB.showToast('Select/Mention Table', 'error');
            const tbl = formTable.value;
            await saveDraftAndReset();
            VB.showToast(`Table ${tbl} saved as draft`, 'success');
            setTimeout(() => { window.location.href = '../pages/tables.html'; }, 1000);
        });
    }

    clearBillBtn.addEventListener('click', () => {
        orderItems = [];
        customerName = '';
        orderNote = '';
        currentOrderId = null;
        micStage = 'idle';
        if (nameEl) nameEl.value = '';
        renderAll();
        micStatus.textContent = 'Tap to Start';
    });

    document.querySelectorAll('.lang-btn')
        .forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.lang-btn')
                    .forEach(b =>
                        b.classList.remove('active'));
                btn.classList.add('active');
                selectedLang = btn.dataset.lang;
            });
        });

    renderAll();
});
