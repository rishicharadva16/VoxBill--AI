'use strict';

document.addEventListener('DOMContentLoaded', () => {

    /* ─────────────────────────────────────────
       ELEMENT BINDINGS
    ───────────────────────────────────────── */
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mobileMenuBtn = document.getElementById('mobileMenu');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    const micBtn = document.getElementById('micBtn');
    const micWrapper = document.getElementById('micWrapper');
    const micStatus = document.getElementById('micStatus');
    const micIcon = document.getElementById('micIcon');
    const liveTranscript = document.getElementById('liveTranscript');
    const transcriptBox = document.getElementById('transcriptBox');

    const formTable = document.getElementById('formTable');
    const formDiscount = document.getElementById('formDiscount');
    const gstToggle = document.getElementById('gstToggle');
    const itemsList = document.getElementById('itemsList');
    const itemCount = document.getElementById('itemCount');

    const manualItem = document.getElementById('manualItem');
    const manualQty = document.getElementById('manualQty');
    const manualPrice = document.getElementById('manualPrice');
    const manualAddBtn = document.getElementById('manualAddBtn');
    const clearBillBtn = document.getElementById('clearBillBtn');
    const whatsappBtn = document.getElementById('whatsappShareBtn');

    // Invoice elements
    const invoiceItems = document.getElementById('invoiceItems');
    const invSubtotal = document.getElementById('invSubtotal');
    const invDiscPct = document.getElementById('invDiscPct');
    const invDiscount = document.getElementById('invDiscount');
    const invTax = document.getElementById('invTax');
    const invGrand = document.getElementById('invGrand');
    const invTable = document.getElementById('invTable');
    const invDate = document.getElementById('invDate');
    const invNo = document.getElementById('invNo');
    const aiSpinner = document.getElementById('aiSpinner');
    // Settings-driven invoice header
    const invRestName = document.getElementById('invRestName');
    const invRestAddr = document.getElementById('invRestAddr');
    const invLogo = document.getElementById('invLogo');
    const invFooterMsg = document.getElementById('invFooterMsg');

    const navItems = document.querySelectorAll('.nav-item');
    const breadcrumb = document.getElementById('breadcrumbCurrent');
    const langBtns = document.querySelectorAll('.lang-btn');
    const suggestionChips = document.querySelectorAll('.suggestion-chip');
    const tmplBtns = document.querySelectorAll('.select-template-btn');
    const tmplCards = document.querySelectorAll('.template-card');

    /* ─────────────────────────────────────────
       STATE
    ───────────────────────────────────────── */
    let orderItems = [];
    let isListening = false;
    let selectedLang =
        localStorage.getItem('vb_voice_language')
        || 'en-IN';
    let currentTotals = { subtotal: 0, discountAmt: 0, taxAmt: 0, grandTotal: 0 };

    /* ─────────────────────────────────────────
       SETTINGS HELPERS (safe fallback if shared.js not loaded)
    ───────────────────────────────────────── */
    function getSettings() {
        return window.VB ? VB.getSettings() : {
            restaurantName: 'VoxBill Restaurant',
            address: '123 Culinary Hub, Cyber City',
            gstNumber: '27AABCV1234M1Z1',
            gstEnabled: true,
            gstPercent: 5,
            footerMsg: 'Thank you for dining with us!',
            logoDataUrl: '',
            upiId: ''
        };
    }

    function getMenuItems() {
        return window.VB ? VB.getMenu() : [];
    }

    /* ─────────────────────────────────────────
       APPLY RESTAURANT SETTINGS TO INVOICE
    ───────────────────────────────────────── */
    function applySettings() {
        const s = getSettings();
        if (invRestName) invRestName.textContent = s.restaurantName.toUpperCase();
        if (invRestAddr) invRestAddr.textContent = `${s.address} · GST: ${s.gstNumber}`;
        if (invFooterMsg) invFooterMsg.textContent = s.footerMsg || 'Thank you for dining with us!';
        if (invLogo) {
            if (s.logoDataUrl) {
                invLogo.src = s.logoDataUrl;
                invLogo.style.display = 'block';
            } else {
                invLogo.style.display = 'none';
            }
        }
    }

    /* ─────────────────────────────────────────
       INIT – Set invoice meta
    ───────────────────────────────────────── */
    if (invDate) invDate.textContent = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    if (invNo) invNo.textContent = String(Math.floor(Math.random() * 900) + 100);
    applySettings();

    /* ─────────────────────────────────────────
       SIDEBAR TOGGLE (DESKTOP)
    ───────────────────────────────────────── */
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('expanded');
            document.querySelector('.main').classList.toggle('shifted');
        });
    }

    /* ─────────────────────────────────────────
       MOBILE MENU
    ───────────────────────────────────────── */
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            sidebarOverlay && sidebarOverlay.classList.toggle('active');
        });
    }
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            sidebarOverlay.classList.remove('active');
        });
    }

    /* ─────────────────────────────────────────
       NAV ITEM HIGHLIGHTING (anchor-based only
       – external links navigate naturally)
    ───────────────────────────────────────── */
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const href = item.getAttribute('href') || '';
            if (href.startsWith('#')) {
                navItems.forEach(n => n.classList.remove('active'));
                item.classList.add('active');
                if (breadcrumb) breadcrumb.textContent = item.dataset.label || '';
                sidebar.classList.remove('mobile-open');
                sidebarOverlay && sidebarOverlay.classList.remove('active');
            }
            // External links (.html pages) navigate by default
        });
    });

    // Scroll spy for anchor sections
    const sections = document.querySelectorAll('section.section');
    if (sections.length > 0) {
        const obs = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const id = entry.target.id;
                navItems.forEach(n => {
                    const href = (n.getAttribute('href') || '').replace('#', '');
                    if (href === id) n.classList.add('active');
                    else if ((n.getAttribute('href') || '').startsWith('#')) n.classList.remove('active');
                });
            });
        }, { threshold: 0.4 });
        sections.forEach(s => obs.observe(s));
    }

    /* ─────────────────────────────────────────
       LANGUAGE SELECTOR
    ───────────────────────────────────────── */
    langBtns.forEach(btn => {
        btn.classList.toggle(
            'active',
            btn.dataset.lang === selectedLang
        );
        btn.addEventListener('click', () => {
            langBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedLang = btn.dataset.lang;
            localStorage.setItem(
                'vb_voice_language',
                selectedLang
            );
            if (recognition) recognition.lang = selectedLang;
        });
    });

    /* ─────────────────────────────────────────
       RENDER BILL & ORDER FORM
    ───────────────────────────────────────── */
    function renderAll() {
        // ─ Left panel: items list
        if (!itemsList) return;

        if (orderItems.length === 0) {
            itemsList.innerHTML = `
                <div class="empty-items">
                    <i class="fa-solid fa-cart-shopping"></i>
                    <p>No items yet. Use voice or add manually.</p>
                </div>`;
        } else {
            itemsList.innerHTML = '';
            orderItems.forEach((item, idx) => {
                const row = document.createElement('div');
                row.className = 'item-row';
                row.innerHTML = `
                    <span class="ir-name">${item.item}</span>
                    <span class="ir-qty">x${item.qty}</span>
                    <span class="ir-price">₹${item.total.toFixed(0)}</span>
                    <button class="ir-del" data-idx="${idx}" title="Remove item">
                        <i class="fa-solid fa-xmark"></i>
                    </button>`;
                itemsList.appendChild(row);
            });
            itemsList.querySelectorAll('.ir-del').forEach(btn => {
                btn.addEventListener('click', e => {
                    orderItems.splice(parseInt(e.currentTarget.dataset.idx), 1);
                    renderAll();
                });
            });
        }
        if (itemCount) itemCount.textContent = `${orderItems.length} item${orderItems.length !== 1 ? 's' : ''}`;

        // ─ Right panel: Invoice
        if (invTable) invTable.textContent = formTable ? (formTable.value || '--') : '--';

        if (invoiceItems) {
            if (orderItems.length === 0) {
                invoiceItems.innerHTML = '<tr><td colspan="3" class="inv-empty">-- empty order --</td></tr>';
            } else {
                invoiceItems.innerHTML = '';
                orderItems.forEach(item => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${item.item}</td>
                        <td class="center">${item.qty}</td>
                        <td class="right">₹${item.total.toFixed(2)}</td>`;
                    invoiceItems.appendChild(tr);
                });
            }
        }

        // ─ Totals — use GST % from settings
        const s = getSettings();
        const gstEnabled = gstToggle ? gstToggle.checked : s.gstEnabled;
        const gstRate = s.gstPercent / 100;
        const subtotal = orderItems.reduce((acc, i) => acc + i.total, 0);
        const discPct = formDiscount ? (parseFloat(formDiscount.value) || 0) : 0;
        const discAmt = (subtotal * discPct) / 100;
        const afterDisc = subtotal - discAmt;
        const taxAmt = gstEnabled ? afterDisc * gstRate : 0;
        const grand = afterDisc + taxAmt;

        if (invSubtotal) invSubtotal.textContent = `₹${subtotal.toFixed(2)}`;
        if (invDiscPct) invDiscPct.textContent = `(${discPct}%)`;
        if (invDiscount) invDiscount.textContent = `-₹${discAmt.toFixed(2)}`;
        if (invTax) invTax.textContent = `₹${taxAmt.toFixed(2)}`;
        if (invGrand) invGrand.textContent = `₹${grand.toFixed(2)}`;

        currentTotals = { subtotal, discountAmt: discAmt, taxAmt, grandTotal: grand };
    }

    /* ─────────────────────────────────────────
       FORM LISTENERS
    ───────────────────────────────────────── */
    formTable && formTable.addEventListener('input', renderAll);
    formDiscount && formDiscount.addEventListener('input', renderAll);
    gstToggle && gstToggle.addEventListener('change', renderAll);

    /* ─────────────────────────────────────────
       MANUAL ADD
    ───────────────────────────────────────── */
    if (manualAddBtn) {
        manualAddBtn.addEventListener('click', () => {
            const name = manualItem ? manualItem.value.trim() : '';
            const qty = manualQty ? parseInt(manualQty.value) : NaN;
            const price = manualPrice ? parseFloat(manualPrice.value) : NaN;
            if (!name || isNaN(qty) || qty < 1 || isNaN(price) || price < 0) return;
            mergeItem({ item: name, qty, price, total: qty * price });
            if (manualItem) manualItem.value = '';
            if (manualQty) manualQty.value = '';
            if (manualPrice) manualPrice.value = '';
            renderAll();
        });
        [manualItem, manualQty, manualPrice].filter(Boolean).forEach(el => {
            el.addEventListener('keydown', e => { if (e.key === 'Enter') manualAddBtn.click(); });
        });
    }

    /* ─────────────────────────────────────────
       CLEAR BILL
    ───────────────────────────────────────── */
    if (clearBillBtn) {
        clearBillBtn.addEventListener('click', () => {
            if (orderItems.length === 0) return;
            if (confirm('Clear all order items?')) { orderItems = []; renderAll(); }
        });
    }

    /* ─────────────────────────────────────────
       SAVE ORDER (dynamically injected button)
    ───────────────────────────────────────── */
    const actionsEl = document.querySelector('.bill-action-btns');
    if (actionsEl) {
        const saveBtn = document.createElement('button');
        saveBtn.className = 'bill-btn';
        saveBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Save';
        saveBtn.title = 'Save order to history';
        saveBtn.style.borderColor = 'rgba(34,211,238,0.3)';
        actionsEl.insertBefore(saveBtn, actionsEl.firstChild);

        saveBtn.addEventListener('click', () => {
            if (orderItems.length === 0) {
                window.VB && VB.showToast('Add items first.', 'error'); return;
            }
            window.VB && VB.saveOrder({
                tableNo: formTable ? formTable.value : '?',
                items: JSON.parse(JSON.stringify(orderItems)),
                ...currentTotals
            });
            window.VB && VB.showToast('Order saved to history! ✅');
        });
    }

    /* ─────────────────────────────────────────
       WHATSAPP SHARING
       (button click → same function as voice command)
    ───────────────────────────────────────── */
    if (whatsappBtn) {
        whatsappBtn.addEventListener('click', () => sendBillWhatsApp());
    }

    /* ─────────────────────────────────────────
       MERGE HELPER (avoid duplicate items)
    ───────────────────────────────────────── */
    function mergeItem(newItem) {
        const idx = orderItems.findIndex(i => i.item.toLowerCase() === newItem.item.toLowerCase());
        if (idx >= 0) {
            orderItems[idx].qty += newItem.qty;
            orderItems[idx].total += newItem.total;
        } else {
            orderItems.push(newItem);
        }
    }

    /* ─────────────────────────────────────────
       LOCAL MENU MATCHING
       Try to match voice text against menu items
       from localStorage before calling backend.
    ───────────────────────────────────────── */
    function matchLocalMenu(text) {
        const menu = getMenuItems();
        if (menu.length === 0) return null;

        const found = [];
        const lower = text.toLowerCase();

        // Number words → digits
        const numWords = {
            'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
            'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'paanch': 5, 'chhe': 6, 'saat': 7, 'aath': 8, 'nau': 9
        };
        let normalized = lower.replace(/\bone\b/gi, '1').replace(/\btwo\b/gi, '2').replace(/\bthree\b/gi, '3')
            .replace(/\bfour\b/gi, '4').replace(/\bfive\b/gi, '5').replace(/\bsix\b/gi, '6')
            .replace(/\bseven\b/gi, '7').replace(/\beight\b/gi, '8').replace(/\bnine\b/gi, '9').replace(/\bten\b/gi, '10');
        Object.entries(numWords).forEach(([w, n]) => {
            normalized = normalized.replace(new RegExp(`\\b${w}\\b`, 'gi'), String(n));
        });

        menu.forEach(menuItem => {
            const nameLower = menuItem.name.toLowerCase();
            // Try to find "N <item>" or "<item>" pattern
            const qtyMatch = new RegExp(`(\\d+)\\s+${nameLower.replace(/\s+/g, '\\s+')}`, 'i').exec(normalized);
            const nameMatch = normalized.includes(nameLower);

            if (qtyMatch) {
                const qty = parseInt(qtyMatch[1]) || 1;
                found.push({ item: menuItem.name, qty, price: menuItem.price, total: qty * menuItem.price });
            } else if (nameMatch) {
                found.push({ item: menuItem.name, qty: 1, price: menuItem.price, total: menuItem.price });
            }
        });

        return found.length > 0 ? found : null;
    }

    /* ─────────────────────────────────────────
       SPEECH RECOGNITION
    ───────────────────────────────────────── */
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;

    if (SpeechAPI && micBtn) {
        recognition = new SpeechAPI();
        window.recognition = recognition;
        recognition.continuous = false;
        recognition.interimResults = true;

        micBtn.addEventListener('click', () => {
            if (isListening) {
                recognition.stop();
            } else {
                recognition.lang = selectedLang;
                try { recognition.start(); } catch (e) { console.warn(e); }
            }
        });

        recognition.onstart = () => {
            isListening = true;
            micBtn.classList.add('listening');
            micWrapper && micWrapper.classList.add('listening');
            if (micIcon) micIcon.className = 'fa-solid fa-stop';
            if (micStatus) micStatus.textContent = 'Listening… speak your order';
            if (liveTranscript) { liveTranscript.textContent = '…'; liveTranscript.classList.remove('placeholder'); }
            transcriptBox && transcriptBox.classList.add('active');
        };

        recognition.onresult = e => {
            let interim = '', final = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) final += t;
                else interim += t;
            }
            if (liveTranscript) liveTranscript.textContent = final || interim;
            if (final) processOrder(final);
        };

        recognition.onerror = e => {
            console.error('SpeechRecognition error:', e.error);
            if (micStatus) micStatus.textContent = `Error: ${e.error}`;
            resetMic();
        };

        recognition.onend = () => resetMic();

    } else if (micBtn) {
        micStatus && (micStatus.textContent = 'Speech API not supported.');
        micBtn.disabled = true;
        micBtn.style.opacity = '0.5';
    }

    function resetMic() {
        isListening = false;
        micBtn && micBtn.classList.remove('listening');
        micWrapper && micWrapper.classList.remove('listening');
        transcriptBox && transcriptBox.classList.remove('active');
        if (micIcon) micIcon.className = 'fa-solid fa-microphone';
        if (micStatus && !micStatus.textContent.toLowerCase().includes('error')) {
            micStatus.textContent = 'Tap to Start Voice Order';
        }
    }

    /* ─────────────────────────────────────────
       VOICE COMMAND PARSER
       Detects non-order commands in speech text.
       Returns true if a command was handled.
    ───────────────────────────────────────── */
    function detectVoiceCommand(text) {
        return false; // Disabled — voice commands handled by voice_script.js and shared.js
        const t = text.toLowerCase().trim();

        // ── Send bill to WhatsApp ────────────────────────
        const waPatterns = [
            /send\s+bill\s+to\s+whatsapp/i,
            /share\s+bill\s+(on|to|via)\s+whatsapp/i,
            /whatsapp\s+(the\s+)?bill/i,
            /send\s+(the\s+)?invoice\s+to\s+whatsapp/i,
        ];
        if (waPatterns.some(p => p.test(t))) {
            sendBillWhatsApp();
            return true;
        }

        // ── Generate / Show Bill ─────────────────────────
        const billPatterns = [/generate\s+bill/i, /print\s+bill/i, /show\s+bill/i, /create\s+invoice/i, /make\s+bill/i];
        if (billPatterns.some(p => p.test(t))) {
            renderAll();
            const el = document.getElementById('invoice');
            el && el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (micStatus) micStatus.textContent = '✅ Invoice ready';
            return true;
        }

        // ── Clear Order ──────────────────────────────────
        const clearPatterns = [/clear\s+(the\s+)?(order|bill|cart)/i, /cancel\s+(the\s+)?(order|bill)/i, /start\s+over/i, /new\s+order/i];
        if (clearPatterns.some(p => p.test(t))) {
            if (orderItems.length === 0) {
                if (micStatus) micStatus.textContent = 'Order is already empty.';
            } else {
                orderItems = [];
                renderAll();
                if (micStatus) micStatus.textContent = '✅ Order cleared';
            }
            return true;
        }

        return false; // not a command — continue to item matching
    }

    /* ─────────────────────────────────────────
       WHATSAPP BILL FUNCTION (also called from
       the WhatsApp button and voice command)
    ───────────────────────────────────────── */
    function sendBillWhatsApp() {
        if (orderItems.length === 0) {
            window.VB && VB.showToast('Add items before sharing.', 'error');
            if (micStatus) micStatus.textContent = 'No items to share.';
            return;
        }

        const phone = prompt('Enter customer WhatsApp number\n(with country code, e.g. 919876543210):');
        if (!phone || phone.trim().length < 10) return;

        const s = getSettings();
        const tableNo = formTable ? (formTable.value || '?') : '?';
        const itemLines = orderItems.map(i =>
            `  • ${i.item} ×${i.qty}   ₹${i.total.toFixed(0)}`
        ).join('\n');

        const msg =
            `🍽️ *${s.restaurantName}*
${s.address}
GST No: ${s.gstNumber}

🪑 *Table ${tableNo} — Bill Summary*
━━━━━━━━━━━━━━━━━━━━
${itemLines}
━━━━━━━━━━━━━━━━━━━━
Subtotal:       ₹${currentTotals.subtotal.toFixed(2)}
Discount:      -₹${currentTotals.discountAmt.toFixed(2)}
GST (${s.gstPercent}%):     ₹${currentTotals.taxAmt.toFixed(2)}
*Grand Total:   ₹${currentTotals.grandTotal.toFixed(2)}*
━━━━━━━━━━━━━━━━━━━━
${s.footerMsg || 'Thank you for dining with us! 🙏'}
_Powered by VoxBill AI_`;

        const url = `https://wa.me/${phone.trim().replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
        if (micStatus) micStatus.textContent = '✅ WhatsApp opened!';
    }

    /* ─────────────────────────────────────────
       PROCESS ORDER (voice command check first,
       then local menu match, then backend API)
    ───────────────────────────────────────── */
    async function processOrder(text) {
        // ── 1. Check for voice meta-commands first
        if (detectVoiceCommand(text)) {
            aiSpinner && aiSpinner.classList.remove('active');
            return;
        }

        if (micStatus) micStatus.textContent = 'Processing…';
        aiSpinner && aiSpinner.classList.add('active');

        try {
            // 1. Try local menu matching first
            const localItems = matchLocalMenu(text);

            if (localItems && localItems.length > 0) {
                localItems.forEach(item => mergeItem(item));
                renderAll();
                if (micStatus) micStatus.textContent = `✅ ${localItems.length} item(s) added`;
                return;
            }

            // 2. Fallback to backend
            const res = await fetch('/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });

            if (!res.ok) throw new Error(`Server ${res.status}`);
            const data = await res.json();

            if (data.items && data.items.length > 0) {
                data.items.forEach(item => mergeItem(item));
                renderAll();
                if (micStatus) micStatus.textContent = `✅ ${data.items.length} item(s) added`;
            } else {
                if (micStatus) micStatus.textContent = 'Could not detect items. Try again.';
            }

        } catch (err) {
            console.error('processOrder error:', err);
            if (micStatus) micStatus.textContent = 'Could not connect to server.';
        } finally {
            aiSpinner && aiSpinner.classList.remove('active');
            setTimeout(() => {
                if (!isListening && micStatus) micStatus.textContent = 'Tap to Start Voice Order';
            }, 3500);
        }
    }

    /* ─────────────────────────────────────────
       SUGGESTION CHIPS
    ───────────────────────────────────────── */
    suggestionChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const text = chip.dataset.text;
            if (liveTranscript) { liveTranscript.textContent = text; liveTranscript.classList.remove('placeholder'); }
            processOrder(text);
        });
    });

    /* ─────────────────────────────────────────
       TEMPLATE SELECTION
    ───────────────────────────────────────── */
    tmplBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.template-card');
            tmplCards.forEach(c => {
                c.classList.remove('active-template');
                const b = c.querySelector('.select-template-btn');
                const badge = c.querySelector('.active-badge');
                if (b) b.textContent = 'Select';
                if (badge) badge.remove();
            });
            card.classList.add('active-template');
            btn.textContent = 'Selected';
            const h4 = card.querySelector('.template-info h4');
            if (h4 && !h4.querySelector('.active-badge')) {
                const badge = document.createElement('span');
                badge.className = 'active-badge';
                badge.textContent = 'Active';
                h4.appendChild(badge);
            }
            // Save template preference
            if (window.VB) {
                const s = VB.getSettings();
                s.invoiceTemplate = card.dataset.template;
                VB.saveSettings(s);
            }
        });
    });

    /* ─────────────────────────────────────────
       INITIAL RENDER
    ───────────────────────────────────────── */
    renderAll();
});
