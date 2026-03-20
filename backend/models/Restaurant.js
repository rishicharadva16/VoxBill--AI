const mongoose = require('mongoose');

const restaurantSchema = new mongoose.Schema({
    name:      { type: String, required: true, trim: true },
    address:   { type: String, default: '' },
    phone:     { type: String, default: '' },
    email:     { type: String, default: '' },
    gstNumber: { type: String, default: '' },
    upiId:     { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Restaurant', restaurantSchema);
