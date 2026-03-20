const express = require('express');
const Menu    = require('../models/Menu');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

/* GET /menu – all menu items for the user's restaurant */
router.get('/', protect, async (req, res) => {
    try {
        const items = await Menu.find({ restaurantId: req.user.restaurantId }).lean();
        res.json({ success: true, data: items });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* POST /menu – add item (manager only) */
router.post('/', protect, requireRole('manager'), async (req, res) => {
    try {
        const { name, category, price } = req.body;
        if (!name || !category || price == null)
            return res.status(400).json({ success: false, message: 'name, category, price required' });

        const item = await Menu.create({ restaurantId: req.user.restaurantId, name, category, price });
        res.status(201).json({ success: true, data: item });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* PUT /menu/:id – update item (manager only) – Fix 24: filtered update */
router.put('/:id', protect, requireRole('manager'), async (req, res) => {
    try {
        const { name, category, price } = req.body;
        const updateData = {};
        if (req.body.name !== undefined) updateData.name = req.body.name;
        if (req.body.category !== undefined) updateData.category = req.body.category;
        if (req.body.price !== undefined) updateData.price = req.body.price;
        if (req.body.disabled !== undefined) updateData.disabled = req.body.disabled;

        const item = await Menu.findOneAndUpdate(
            { _id: req.params.id, restaurantId: req.user.restaurantId },
            updateData,
            { new: true, runValidators: true }
        );
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
        res.json({ success: true, data: item });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* DELETE /menu/:id – remove item (manager only) */
router.delete('/:id', protect, requireRole('manager'), async (req, res) => {
    try {
        const item = await Menu.findOneAndDelete({ _id: req.params.id, restaurantId: req.user.restaurantId });
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
        res.json({ success: true, message: 'Item removed' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* POST /menu/bulk – replace all menu items (import from localStorage) */
router.post('/bulk', protect, requireRole('manager'), async (req, res) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items)) return res.status(400).json({ success: false, message: 'items array required' });
        await Menu.deleteMany({ restaurantId: req.user.restaurantId });
        const created = await Menu.insertMany(
            items.map(i => ({ restaurantId: req.user.restaurantId, name: i.name, category: i.category, price: i.price }))
        );
        res.json({ success: true, data: created });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* DELETE /menu/all – clear all menu items (manager only) – Fix 19 */
router.delete('/all', protect, requireRole('manager'), async (req, res) => {
    try {
        await Menu.deleteMany({ restaurantId: req.user.restaurantId });
        res.json({ success: true, message: 'All menu items cleared' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
