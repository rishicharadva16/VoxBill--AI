/**
 * VoxBill Invoice Generation Helpers
 * Handles HTML rendering, QR Code, PDF generation, and WhatsApp sharing.
 */

/**
 * Opens a new window containing only the invoice HTML and triggers the print dialog.
 * This avoids the blank-page problem that occurs when window.print() prints the full page.
 */
window.printInvoice = function(order, settings) {
    const invoiceEl = document.getElementById('invoicePrintArea');
    if (!invoiceEl) {
        if (window.VB) VB.showToast('Invoice not found. Open the bill first.', 'error');
        return;
    }

    // Gather the existing invoice CSS from the page
    const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .map(l => `<link rel="stylesheet" href="${l.href}">`)
        .join('\n');

    const printWindow = window.open('', '_blank', 'width=700,height=900');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Invoice</title>
            ${styleLinks}
            <style>
                body { background: #fff; margin: 0; padding: 2rem; font-family: 'Inter', sans-serif; }
                .invoice-container { border: none !important; box-shadow: none !important; max-width: 100% !important; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            ${invoiceEl.outerHTML}
            <script>
                window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
};

window.generateInvoiceHTML = function(order, settings) {
    const subtotal = order.subtotal || 0;
    const discount = order.discountAmt || 0;
    const gst      = order.gst || 0;
    const total    = order.total || 0;
    
    // Fallbacks for missing settings
    const rName = settings.restaurantName || 'Restaurant Name';
    const rAddr = settings.address || 'Address not provided';
    const rPhone = settings.phone || '';
    const rGst = settings.gstNumber || '';
    const footerMsg = settings.footerMsg || 'Thank you for dining with us!';
    
    const invoiceId = order.invoiceNumber || (order._id ? order._id.toString().slice(-6).toUpperCase() : 'N/A');
    const dt = new Date(order.createdAt || Date.now());
    const dateStr = dt.toLocaleDateString('en-IN');
    const timeStr = dt.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });

    let phoneHtml = rPhone ? `<p>Phone: ${rPhone}</p>` : '';
    let gstHtml = rGst ? `<p>GSTIN: ${rGst}</p>` : '';

    let qrSection = '';
    if (settings.upiId) {
        qrSection = `
            <div class="invoice-qr-section" style="text-align:center; margin-top:1.5rem; padding-top:1.5rem; border-top:1px dashed #cbd5e1;">
                <p style="font-weight:700; font-size:0.9rem; margin-bottom:0.5rem;">Scan to Pay</p>
                <div id="invoiceQR" style="display:inline-block; margin-bottom:0.5rem;"></div>
                <p style="font-size:0.8rem; color:#475569;">UPI ID: ${settings.upiId}</p>
            </div>
        `;
    }

    return `
        <div id="invoicePrintArea" class="invoice-container invoice-${settings.invoiceTemplate || 'modern'}">
            <div class="invoice-header">
                ${settings.logoDataUrl ? `<img src="${settings.logoDataUrl}" alt="${rName} Logo" class="invoice-logo">` : ''}
                <h2 class="invoice-restaurant-name">${rName}</h2>
                <div class="invoice-contact-info">
                    <p>${rAddr}</p>
                    ${phoneHtml}
                    ${gstHtml}
                </div>
            </div>
            
            <div class="invoice-meta">
                <div class="invoice-meta-left">
                    <p><strong>Invoice #:</strong> ${invoiceId}</p>
                    <p><strong>Table #:</strong> ${order.tableNumber || 'N/A'}</p>
                </div>
                <div class="invoice-meta-right">
                    <p><strong>Date:</strong> ${dateStr}</p>
                    <p><strong>Time:</strong> ${timeStr}</p>
                </div>
            </div>

            ${order.customerName ? `<p><strong>Customer:</strong> ${order.customerName}</p>` : ''}
            ${order.waiterName ? `<p><strong>Served by:</strong> ${order.waiterName}</p>` : ''}

            <table class="invoice-table">
                <thead>
                    <tr>
                        <th align="left">Item</th>
                        <th align="center">Qty</th>
                        <th align="right">Price</th>
                        <th align="right">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${(order.items || []).map(i => {
                        const price = i.price || (i.total / i.qty); 
                        return `
                        <tr>
                            <td>${i.item}</td>
                            <td align="center">${i.qty}</td>
                            <td align="right">₹${price.toFixed(2)}</td>
                            <td align="right">₹${i.total.toFixed(2)}</td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>

            <div class="invoice-summary">
                <div class="invoice-summary-row">
                    <span>Subtotal</span>
                    <span>₹${subtotal.toFixed(2)}</span>
                </div>
                <div class="invoice-summary-row">
                    <span>Discount</span>
                    <span>-₹${discount.toFixed(2)}</span>
                </div>
                <div class="invoice-summary-row">
                    <span>GST</span>
                    <span>₹${gst.toFixed(2)}</span>
                </div>
                <div class="invoice-summary-row grand-total">
                    <span>Grand Total</span>
                    <span>₹${total.toFixed(2)}</span>
                </div>
            </div>
            
            ${qrSection}

            <div class="invoice-footer" style="margin-top:1.5rem;">
                <p>${footerMsg}</p>
            </div>
        </div>
    `;
};

// New function to actually render the QR code after the HTML is in the DOM
window.renderInvoiceQR = function(order, settings) {
    const qrDiv = document.getElementById("invoiceQR");
    if (!qrDiv || !settings.upiId || !window.QRCode) return;

    // Clear previous QR if any
    qrDiv.innerHTML = '';

    const upiUrl = `upi://pay?pa=${settings.upiId}&pn=${encodeURIComponent(settings.restaurantName || 'Restaurant')}&am=${(order.total || 0).toFixed(2)}&cu=INR`;
    
    new QRCode(qrDiv, {
        text: upiUrl,
        width: 120,
        height: 120,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
};

window.generateInvoiceQR = function(order, settings) {
    // If modal is open, we can just ensure it's rendered. 
    // If not, we could technically show a separate QR modal, but for now, 
    // it's mainly integrated into the bill.
    window.renderInvoiceQR(order, settings);
    const el = document.getElementById('invoiceQR');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
};

window.generateInvoicePDF = function(order, settings) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        if (window.VB && window.VB.showToast) window.VB.showToast("PDF Library failed to load.", "error");
        return;
    }

    const { jsPDF } = window.jspdf;
    
    // Switching to thermal receipt style format [80mm, 200mm]
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, 200]
    });
    
    let yPos = 10;
    const margin = 5;
    const pageWidth = 80;
    const contentWidth = pageWidth - (margin * 2);

    const centerText = (text, y, fontSize, isBold = false) => {
        doc.setFontSize(fontSize);
        doc.setFont("helvetica", isBold ? "bold" : "normal");
        const lines = doc.splitTextToSize(text, contentWidth);
        doc.text(lines, pageWidth / 2, y, { align: 'center' });
        return lines.length * (fontSize * 0.4);
    };

    // --- Header ---
    yPos += centerText(settings.restaurantName || 'VoxBill Restaurant', yPos, 14, true);
    yPos += 2;
    yPos += centerText(settings.address || '', yPos, 8);
    yPos += 1;
    if (settings.phone) yPos += centerText(`Phone: ${settings.phone}`, yPos, 8);
    if (settings.gstNumber) yPos += centerText(`GSTIN: ${settings.gstNumber}`, yPos, 8);
    
    yPos += 2;
    doc.setLineDash([1, 1], 0);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 4;

    // --- Meta ---
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    const invoiceId = order.invoiceNumber || (order._id ? order._id.toString().slice(-6).toUpperCase() : 'N/A');
    doc.text(`Inv: ${invoiceId}`, margin, yPos);
    doc.text(`Table: ${order.tableNumber || 'N/A'}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 4;

    doc.setFont("helvetica", "normal");
    const dt = new Date(order.createdAt || Date.now());
    doc.text(`${dt.toLocaleDateString('en-IN')} ${dt.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})}`, margin, yPos);
    yPos += 4;

    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 4;

    // --- Items ---
    doc.setFont("helvetica", "bold");
    doc.text("Item", margin, yPos);
    doc.text("Qty", margin + 30, yPos);
    doc.text("Price", margin + 45, yPos);
    doc.text("Amount", pageWidth - margin, yPos, { align: 'right' });
    yPos += 3;
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 4;

    doc.setFont("helvetica", "normal");
    (order.items || []).forEach(i => {
        const itemPrice = (i.price || (i.total / i.qty)).toFixed(2);
        const itemLines = doc.splitTextToSize(i.item, 28);
        doc.text(itemLines, margin, yPos);
        doc.text(i.qty.toString(), margin + 30, yPos);
        doc.text(itemPrice, margin + 45, yPos);
        doc.text(i.total.toFixed(2), pageWidth - margin, yPos, { align: 'right' });
        yPos += Math.max(itemLines.length * 4, 5);
    });

    yPos += 2;
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 4;

    // --- Summary ---
    const subtotal = order.subtotal || 0;
    const discount = order.discountAmt || 0;
    const gst      = order.gst || 0;
    const total    = order.total || 0;

    const printRow = (label, val, isBold = false) => {
        doc.setFont("helvetica", isBold ? "bold" : "normal");
        doc.text(label, margin + 30, yPos);
        doc.text(val, pageWidth - margin, yPos, { align: 'right' });
        yPos += 5;
    };

    printRow("Subtotal:", subtotal.toFixed(2));
    if (discount > 0) printRow("Discount:", `-${discount.toFixed(2)}`);
    printRow("GST:", gst.toFixed(2));
    
    yPos += 1;
    doc.setFontSize(10);
    printRow("TOTAL:", `Rs ${total.toFixed(2)}`, true);
    
    yPos += 5;
    centerText(settings.footerMsg || 'Thank you for dining with us!', yPos, 8);
    yPos += 5;

    // Save
    const filename = `invoice_table_${order.tableNumber || 'unknown'}.pdf`;
    doc.save(filename);
};

window.generateWhatsAppMessage = function(order, settings) {
    const rName = settings.restaurantName || 'Restaurant Name';
    const total = (order.total || 0).toFixed(2);
    
    let message = `*Invoice – ${rName}*\n\n`;
    message += `Table: ${order.tableNumber || 'N/A'}\n\n`;
    
    (order.items || []).forEach(i => {
        message += `${i.item} x${i.qty}\n`;
    });
    
    message += `\n*Total: ₹${total}*\n\n`;
    message += `Scan QR to pay or visit again!\n\n`;
    message += `${settings.footerMsg || 'Thank you for dining with us.'}`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
};

/* ═══════════════════════════════════════════
   BILL IMAGE SHARING SYSTEM
   Uses html2canvas + jsPDF for image/PDF capture
   ═══════════════════════════════════════════ */

/**
 * Generates clean, white-background, inline-styled invoice HTML
 * suitable for html2canvas capture (no CSS vars, no blur, all px).
 */
window.generateInvoiceHTMLCapture = function(order, settings) {
    const subtotal = order.subtotal || 0;
    const discount = order.discountAmt || 0;
    const gst      = order.gst || 0;
    const total    = order.total || 0;

    const rName = settings.restaurantName || 'Restaurant';
    const rAddr = settings.address || '';
    const rPhone = settings.phone || '';
    const rGst = settings.gstNumber || '';
    const footerMsg = settings.footerMsg || 'Thank you for dining with us!';

    const invoiceId = order.invoiceNumber ||
        (order._id ? order._id.toString().slice(-6).toUpperCase() : 'N/A');
    const dt = new Date(order.createdAt || Date.now());
    const dateStr = dt.toLocaleDateString('en-IN');
    const timeStr = dt.toLocaleTimeString('en-IN',
        { hour: '2-digit', minute: '2-digit' });

    let itemsHtml = (order.items || []).map(i => {
        const price = i.price || (i.total / i.qty);
        return `<tr>
            <td style="padding:6px 8px; border-bottom:1px solid #e2e8f0; color:#374151; font-size:13px;">${i.item}</td>
            <td style="padding:6px 8px; border-bottom:1px solid #e2e8f0; color:#374151; font-size:13px; text-align:center;">${i.qty}</td>
            <td style="padding:6px 8px; border-bottom:1px solid #e2e8f0; color:#374151; font-size:13px; text-align:right;">₹${price.toFixed(2)}</td>
            <td style="padding:6px 8px; border-bottom:1px solid #e2e8f0; color:#111827; font-size:13px; text-align:right; font-weight:600;">₹${i.total.toFixed(2)}</td>
        </tr>`;
    }).join('');

    return `
    <div style="background:#ffffff; color:#111827; padding:24px; font-family:'Inter',sans-serif; width:100%; box-sizing:border-box;">
        <!-- Header -->
        <div style="text-align:center; margin-bottom:16px; padding-bottom:16px; border-bottom:2px solid #22D3EE;">
            <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800; color:#111827; letter-spacing:-0.02em;">${rName}</h2>
            <p style="margin:2px 0; font-size:11px; color:#6b7280;">${rAddr}</p>
            ${rPhone ? `<p style="margin:2px 0; font-size:11px; color:#6b7280;">Phone: ${rPhone}</p>` : ''}
            ${rGst ? `<p style="margin:2px 0; font-size:11px; color:#6b7280;">GSTIN: ${rGst}</p>` : ''}
        </div>

        <!-- Meta -->
        <div style="display:flex; justify-content:space-between; margin-bottom:12px; font-size:12px;">
            <div>
                <p style="margin:2px 0; color:#374151;"><strong>Invoice #:</strong> ${invoiceId}</p>
                <p style="margin:2px 0; color:#374151;"><strong>Table #:</strong> ${order.tableNumber || 'N/A'}</p>
            </div>
            <div style="text-align:right;">
                <p style="margin:2px 0; color:#374151;"><strong>Date:</strong> ${dateStr}</p>
                <p style="margin:2px 0; color:#374151;"><strong>Time:</strong> ${timeStr}</p>
            </div>
        </div>

        ${order.customerName ? `<p style="margin:4px 0 8px 0; font-size:12px; color:#374151;"><strong>Customer:</strong> ${order.customerName}</p>` : ''}
        ${order.waiterName ? `<p style="margin:4px 0 8px 0; font-size:12px; color:#374151;"><strong>Served by:</strong> ${order.waiterName}</p>` : ''}

        <!-- Items -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:12px;">
            <thead>
                <tr style="background:#f1f5f9;">
                    <th style="padding:8px; text-align:left; font-size:11px; font-weight:700; color:#475569; text-transform:uppercase;">Item</th>
                    <th style="padding:8px; text-align:center; font-size:11px; font-weight:700; color:#475569; text-transform:uppercase;">Qty</th>
                    <th style="padding:8px; text-align:right; font-size:11px; font-weight:700; color:#475569; text-transform:uppercase;">Price</th>
                    <th style="padding:8px; text-align:right; font-size:11px; font-weight:700; color:#475569; text-transform:uppercase;">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>

        <!-- Summary -->
        <div style="border-top:1px solid #e2e8f0; padding-top:10px;">
            <div style="display:flex; justify-content:space-between; padding:4px 0; font-size:13px; color:#6b7280;">
                <span>Subtotal</span><span>₹${subtotal.toFixed(2)}</span>
            </div>
            ${discount > 0 ? `<div style="display:flex; justify-content:space-between; padding:4px 0; font-size:13px; color:#ef4444;">
                <span>Discount</span><span>-₹${discount.toFixed(2)}</span>
            </div>` : ''}
            <div style="display:flex; justify-content:space-between; padding:4px 0; font-size:13px; color:#6b7280;">
                <span>GST</span><span>₹${gst.toFixed(2)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:8px 0; font-size:16px; font-weight:800; color:#111827; border-top:2px solid #111827; margin-top:6px;">
                <span>Grand Total</span><span>₹${total.toFixed(2)}</span>
            </div>
        </div>

        <!-- Footer -->
        <div style="text-align:center; margin-top:16px; padding-top:12px; border-top:1px dashed #cbd5e1;">
            <p style="font-size:12px; color:#6b7280; margin:0;">${footerMsg}</p>
            <p style="font-size:10px; color:#94a3b8; margin:6px 0 0 0;">Powered by VoxBill</p>
        </div>
    </div>`;
};


