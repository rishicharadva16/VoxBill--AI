/**
 * VoxBill – Smart Paper Order Extraction (Rush Mode)
 */

document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById('openRushModeBtn');
    const closeBtn = document.getElementById('closeRushModeBtn');
    const modal = document.getElementById('rushModeModal');
    
    const uploadStep = document.getElementById('rushUploadStep');
    const fileInput = document.getElementById('rushFileInput');
    
    const loadingStep = document.getElementById('rushLoadingStep');
    const reviewStep = document.getElementById('rushReviewStep');
    
    const reviewTableBody = document.getElementById('rushReviewTableBody');
    const confirmBtn = document.getElementById('rushConfirmBtn');
    const cancelBtn = document.getElementById('rushCancelBtn');

    if (!modal) return; // not on voice.html

    let extractedItems = []; // To store mock extraction maps

    // Open Modal
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            modal.style.display = 'flex';
            resetRushModal();
        });
    }

    // Close Modal
    function closeModal() {
        modal.style.display = 'none';
        if (fileInput) fileInput.value = '';
    }
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    function resetRushModal() {
        uploadStep.style.display = 'block';
        loadingStep.style.display = 'none';
        reviewStep.style.display = 'none';
        extractedItems = [];
        document.getElementById('rushTableInput').value = '';
        document.getElementById('rushCustomerInput').value = '';
        document.getElementById('rushNoteInput').value = '';
    }

    // Convert image file to base64 string
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(
                reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    fileInput.addEventListener('change', async (e) => {
        if (!e.target.files.length) return;

        const file = e.target.files[0];
        uploadStep.style.display = 'none';
        loadingStep.style.display = 'block';

        try {
            const base64 = await fileToBase64(file);

            // Fetch fresh live menu from backend
            const token = sessionStorage.getItem('vb_jwt');
            const menuRes = await fetch('/api/menu', {
                headers: { 
                    'Authorization': `Bearer ${token}` 
                }
            });
            const menuData = await menuRes.json();
            const menuItems = menuData.success 
                ? menuData.data : [];
            window._cachedMenu = menuItems;

            await runAIExtraction(base64, menuItems);
        } catch (err) {
            console.error('Rush mode error:', err);
            if (window.showToast) {
                showToast(
                    'Could not process image: ' + err.message,
                    'error');
            }
            resetRushModal();
        }
    });

    async function runAIExtraction(base64Image, menuItems) {
        const menuList = menuItems.length > 0
            ? menuItems.map(m =>
                `${m.name} (Category: ${m.category}, ` +
                `Price: ₹${m.price})`
              ).join('\n')
            : 'No menu loaded — use best judgment';

        const shortCodes = menuItems
            .filter(m => m.shortCode)
            .map(m => `${m.shortCode} = ${m.name}`)
            .join('\n');

        const prompt = `You are a restaurant order extraction system.

Look at this handwritten order slip image carefully.

The restaurant menu is:
${menuList}

${shortCodes ? `Short codes:\n${shortCodes}` : ''}

Instructions:
1. Read ALL handwritten items from the image
2. Match each item to the closest menu item above
   even if spelling is bad, abbreviated, or unclear
3. Extract the quantity for each item (default 1 
   if not written)
4. Return ONLY a JSON array, no explanation, 
   no markdown, no code blocks

Return format:
[
  {
    "handwritten": "exact text you saw in image",
    "mappedName": "exact menu item name from list",
    "qty": 2,
    "price": 250,
    "confidence": "high"
  }
]

confidence = "high" if you are sure about the match
confidence = "low" if handwriting was unclear or 
             match is approximate

If you cannot read an item at all, still include it
with confidence "low" and your best guess.`;

        const apiKey = window.ANTHROPIC_API_KEY || '';
        if (!apiKey) {
            throw new Error(
                'Anthropic API key not set. ' +
                'Add it to config.js');
        }

        const response = await fetch(
            'https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01',
                'x-api-key': apiKey,
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-opus-4-5',
                max_tokens: 1024,
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/jpeg',
                                data: base64Image
                            }
                        },
                        {
                            type: 'text',
                            text: prompt
                        }
                    ]
                }]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error?.message || 'Claude API error');
        }

        let raw = data.content[0].text.trim();
        raw = raw.replace(/```json|```/g, '').trim();

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            throw new Error(
                'Could not parse AI response. ' +
                'Try a clearer image.');
        }

        // Map parsed items — always use DB price, not AI price
        extractedItems = parsed.map(item => {
            const menuMatch = menuItems.find(m =>
                m.name.toLowerCase() === 
                item.mappedName.toLowerCase()
            ) || menuItems.find(m =>
                m.name.toLowerCase().includes(
                    item.mappedName.toLowerCase()
                        .split(' ')[0])
            );

            return {
                text:       item.handwritten,
                mappedName: menuMatch 
                    ? menuMatch.name : item.mappedName,
                qty:        item.qty || 1,
                price:      menuMatch 
                    ? menuMatch.price : (item.price || 0),
                menuId:     menuMatch 
                    ? menuMatch._id : null,
                confidence: item.confidence || 'low'
            };
        });

        loadingStep.style.display = 'none';
        reviewStep.style.display = 'block';
        renderReviewTable();

        // Focus table input for quick entry
        const tableInput = document
            .getElementById('rushTableInput');
        if (tableInput && !tableInput.value) {
            tableInput.focus();
        }
    }

    function renderReviewTable() {
        reviewTableBody.innerHTML = '';
        extractedItems.forEach((item, index) => {
            const tr = document.createElement('tr');
            
            // Text color based on mock confidence
            const colorClass = item.confidence === 'high' ? 'color: var(--teal);' : 'color: var(--warning);';
            const icon = item.confidence === 'high' ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-solid fa-circle-exclamation"></i>';
            
            tr.innerHTML = `
                <td style="font-family: monospace; font-size: 0.85rem; color: var(--text-muted);">${item.text}</td>
                <td style="font-weight: 500; ${colorClass}">${icon} ${item.mappedName}</td>
                <td>
                    <input type="number" class="form-input" value="${item.qty}" min="1" style="width: 60px; padding: 0.2rem 0.5rem;" onchange="window.updateRushQty(${index}, this.value)">
                </td>
                <td style="text-align: right;">
                    <button class="btn-danger" style="padding: 0.2rem 0.6rem;" onclick="window.removeRushItem(${index})"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            reviewTableBody.appendChild(tr);
        });

        if (extractedItems.length === 0) {
            reviewTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No items detected.</td></tr>';
        }
    }

    // Expose table modifiers to window for inline HTML onclicks
    window.updateRushQty = function(index, newQty) {
        if (extractedItems[index]) {
            extractedItems[index].qty = parseInt(newQty) || 1;
        }
    };
    
    window.removeRushItem = function(index) {
        extractedItems.splice(index, 1);
        renderReviewTable();
    };

    // Confirm & Inject Order
    confirmBtn.addEventListener('click', async () => {
        if (extractedItems.length === 0) {
            if(window.showToast) showToast('No items to submit. Upload failed?', 'error');
            return;
        }

        const tableNo = document.getElementById('rushTableInput').value;
        const customerName = document.getElementById('rushCustomerInput').value;
        const notes = document.getElementById('rushNoteInput').value;

        if (!tableNo) {
            if(window.showToast) showToast('Table number is required.', 'error');
            return;
        }

        // Map extractedItems to proper order structure
        const finalItems = extractedItems.map(i => ({
            item: i.mappedName,
            qty: i.qty,
            price: i.price,
            total: i.qty * i.price
        }));

        const orderData = {
            tableNo: parseInt(tableNo),
            customerName: customerName,
            items: finalItems,
            status: 'ordering',
            note: notes
        };

        const originalBtnText = confirmBtn.innerHTML;
        confirmBtn.innerHTML = '<div class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>';
        confirmBtn.disabled = true;

        try {
            const res = await VoxAPI.saveOrder(orderData);
            if (res.ok) {
                if (window.showToast) showToast('Paper order extracted & injected successfully!');
                closeModal();
                // If we want to refresh active order, wait... usually it sends it back. We don't have to bind perfectly if Voice page handles its own.
            } else {
                throw new Error(res.data?.message || 'Failed to save order.');
            }
        } catch (error) {
            console.error(error);
            if (window.showToast) showToast('Error injecting order: ' + error.message, 'error');
        } finally {
            confirmBtn.innerHTML = originalBtnText;
            confirmBtn.disabled = false;
        }
    });

});

function parseOCRText(rawText, menuItems) {
    const lines = rawText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    console.log('[Rush] OCR lines:', lines);

    const results = [];
    let detectedTable = null;
    let detectedCustomer = null;

    // Build code lookup map from menu
    // { "1": menuItem, "2": menuItem, ... }
    const codeMap = {};
    for (const item of menuItems) {
        if (item.code) {
            codeMap[String(item.code)] = item;
        }
    }

    for (const line of lines) {
        const clean = line.trim();

        // Detect table number
        // Patterns: T5, T 5, Table 5, t5
        const tableMatch = clean.match(
            /^[Tt](?:able)?\s*(\d+)/i);
        if (tableMatch) {
            detectedTable = tableMatch[1];
            continue;
        }

        // Detect customer name
        // Patterns: C Rahul, C: Rahul, Customer Rahul
        const custMatch = clean.match(
            /^[Cc](?:ustomer)?[:\s]+(.+)/i);
        if (custMatch) {
            detectedCustomer = custMatch[1].trim();
            continue;
        }

        // Parse order line
        // Supported formats:
        // 01x2    (code x qty)
        // 01 x 2  (code space x space qty)
        // 01X2    (uppercase X)
        // 01×2    (unicode times)
        // 01 2    (code space qty)
        // 2       (just code, qty=1)
        // 01*2    (code * qty)

        const patterns = [
            // code[x/*×]qty
            /^(\d+)\s*[xX×\*]\s*(\d+)$/,
            // code space qty
            /^(\d+)\s+(\d+)$/,
            // just code
            /^(\d+)$/,
        ];

        let code = null;
        let qty = 1;

        for (const pattern of patterns) {
            const m = clean.match(pattern);
            if (m) {
                code = m[1];
                qty = m[2] ? parseInt(m[2]) : 1;
                break;
            }
        }

        if (!code) continue;

        // Look up menu item by code
        const menuItem = codeMap[code];

        if (menuItem) {
            // Check if already in results
            const existing = results.find(
                r => r.menuId === menuItem._id
                  || String(menuItem.code) === code
            );
            if (existing) {
                existing.qty += qty;
            } else {
                results.push({
                    text:       clean,
                    mappedName: menuItem.name,
                    qty:        qty,
                    price:      menuItem.price,
                    menuId:     menuItem._id,
                    confidence: 'high'
                });
            }
        } else if (code) {
            // Code not found in menu
            results.push({
                text:       clean,
                mappedName: `Unknown code: ${code}`,
                qty:        qty,
                price:      0,
                menuId:     null,
                confidence: 'low'
            });
        }
    }

    // Auto-fill table and customer if detected
    if (detectedTable) {
        const tableInput = document
            .getElementById('rushTableInput');
        if (tableInput) {
            tableInput.value = detectedTable;
        }
    }
    if (detectedCustomer) {
        const custInput = document
            .getElementById('rushCustomerInput');
        if (custInput) {
            custInput.value = detectedCustomer;
        }
    }

    return results;
}
