const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    restaurantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', unique: true },
    restaurantName:  { type: String, default: 'VoxBill Restaurant' },
    address:         { type: String, default: '' },
    phone:           { type: String, default: '' },
    email:           { type: String, default: '' },
    gstNumber:       { type: String, default: '' },
    upiId:           { type: String, default: '' },
    gstEnabled:      { type: Boolean, default: true },
    gstPercent:      { type: Number, default: 5 },
    invoiceTemplate: { type: String, default: 'modern' },
    footerMsg:       { type: String, default: 'Thank you for dining with us!' },
    logoDataUrl:     { type: String, default: '' },
    invoiceCounter:  { type: Number, default: 0 },
    restaurantPin:   { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
