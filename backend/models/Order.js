const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    item:  { type: String, required: true },
    qty:   { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
}, { _id: false });

const orderSchema = new mongoose.Schema({
    restaurantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' },
    tableNumber:   { type: Number, required: true },
    customerName:  { type: String, default: '', trim: true },
    waiterName:    { type: String, default: '' },
    notes:         { type: String, default: '', trim: true },
    invoiceNumber: { type: String, default: '' },
    items:         [orderItemSchema],
    subtotal:      { type: Number, default: 0 },
    discountAmt:   { type: Number, default: 0 },
    gst:           { type: Number, default: 0 },
    total:         { type: Number, required: true },
    status:        { type: String, enum: ['draft', 'ordering', 'ready_for_billing', 'paid'], default: 'ordering' },
    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
