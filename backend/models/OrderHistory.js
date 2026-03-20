const mongoose = require('mongoose');

const orderHistorySchema = new mongoose.Schema({
    invoiceNumber:  { type: String, unique: true },
    orderId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    restaurantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' },
    tableNumber:    { type: Number },
    customerName:   { type: String, default: 'Guest' },
    waiterName:     { type: String, default: 'Unknown' },
    waiterId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [
        {
            name:  { type: String },
            qty:   { type: Number },
            price: { type: Number },
            total: { type: Number }
        }
    ],
    subtotal:        { type: Number, default: 0 },
    gstPercent:      { type: Number, default: 0 },
    gstAmount:       { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    discountAmount:  { type: Number, default: 0 },
    grandTotal:      { type: Number },
    paymentMethod:   { type: String, default: 'cash' },
    paidAt:          { type: Date, default: Date.now },
    createdAt:       { type: Date, default: Date.now }
});

// Auto-generate invoice number before saving
orderHistorySchema.pre('save', async function(next) {
    if (!this.invoiceNumber) {
        const year = new Date().getFullYear();
        const count = await mongoose.model('OrderHistory').countDocuments();
        const padded = String(count + 1).padStart(4, '0');
        this.invoiceNumber = `INV-${year}-${padded}`;
    }
    next();
});

// Indexes for fast querying
orderHistorySchema.index({ paidAt: -1 });
orderHistorySchema.index({ customerName: 'text', invoiceNumber: 'text', waiterName: 'text' });
orderHistorySchema.index({ waiterName: 1 });
orderHistorySchema.index({ grandTotal: 1 });
orderHistorySchema.index({ restaurantId: 1, paidAt: -1 });

module.exports = mongoose.model('OrderHistory', orderHistorySchema);
