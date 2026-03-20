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

    // Handle Upload
    fileInput.addEventListener('change', (e) => {
        if (!e.target.files.length) return;
        
        // Show loading state
        uploadStep.style.display = 'none';
        loadingStep.style.display = 'block';

        // Simulate OCR/Vision processing delay
        setTimeout(() => {
            runMockExtraction();
        }, 1800);
    });

    function runMockExtraction() {
        loadingStep.style.display = 'none';
        reviewStep.style.display = 'block';

        // Try to fetch actual global menu to map something realistic
        let menuItems = window._cachedMenu || [];
        
        // Demo items matching some random handwritten texts
        let mockData = [
            { text: "Pnj Thali 2",  menuId: null, mappedName: "Punjabi Thali", qty: 2, price: 150, confidence: "high" },
            { text: "Btn Naan x3",  menuId: null, mappedName: "Butter Naan",   qty: 3, price: 30,  confidence: "high" },
            { text: "Paneer tika",  menuId: null, mappedName: "Paneer Tikka",  qty: 1, price: 180, confidence: "low" }
        ];

        // Replace mappedNames with closest match from actual menu if available
        if (menuItems.length > 0) {
            mockData.forEach(mock => {
                const match = menuItems.find(m => m.name.toLowerCase().includes(mock.mappedName.toLowerCase().split(' ')[0]));
                if (match) {
                    mock.mappedName = match.name;
                    mock.price = match.price;
                    mock.menuId = match._id;
                }
            });
        }

        extractedItems = mockData;
        renderReviewTable();

        // Randomize mock form data
        document.getElementById('rushTableInput').value = Math.floor(Math.random() * 5) + 1;
        document.getElementById('rushCustomerInput').value = "Walk in (Auto-detected)";
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
