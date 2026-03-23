const mongoose = require('mongoose');

const menuSchema = new mongoose.Schema({
    restaurantId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Restaurant' 
    },
    name:     { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    price:    { type: Number, required: true, min: 0 },
    code:     { 
        type: Number, 
        default: null 
    },
    disabled: { type: Boolean, default: false },
}, { timestamps: true });

// Ensure code is unique per restaurant
menuSchema.index(
    { restaurantId: 1, code: 1 }, 
    { unique: true, sparse: true }
);

module.exports = mongoose.model('Menu', menuSchema);
