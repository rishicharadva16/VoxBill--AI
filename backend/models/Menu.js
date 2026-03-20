const mongoose = require('mongoose');

const menuSchema = new mongoose.Schema({
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' },
    name:         { type: String, required: true, trim: true },
    category:     { type: String, required: true, trim: true },
    price:        { type: Number, required: true, min: 0 },
    disabled:     { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Menu', menuSchema);
