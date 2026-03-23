const express = require('express');
const Menu    = require('../models/Menu');
const { protect, requireRole } = 
    require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/menu
router.get('/', protect, async (req, res) => {
    try {
        const items = await Menu.find({ 
            restaurantId: req.user.restaurantId 
        }).lean();
        res.json({ success: true, data: items });
    } catch (err) {
        res.status(500).json({ 
            success: false, message: err.message });
    }
});

// POST /api/menu
router.post('/', protect, requireRole('manager'), 
    async (req, res) => {
    try {
        const { name, category, price } = req.body;
        if (!name || !category || price == null)
            return res.status(400).json({ 
                success: false, 
                message: 'name, category, price required' 
            });
        const item = await Menu.create({ 
            restaurantId: req.user.restaurantId, 
            name, category, price 
        });
        res.status(201).json({ success: true, data: item });
    } catch (err) {
        res.status(500).json({ 
            success: false, message: err.message });
    }
});

// POST /api/menu/bulk
router.post('/bulk', protect, requireRole('manager'), 
    async (req, res) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items)) 
            return res.status(400).json({ 
                success: false, 
                message: 'items array required' 
            });
        await Menu.deleteMany({ 
            restaurantId: req.user.restaurantId 
        });
        const created = await Menu.insertMany(
            items.map(i => ({ 
                restaurantId: req.user.restaurantId, 
                name: i.name, 
                category: i.category, 
                price: i.price,
                code: i.code || null
            }))
        );
        res.json({ success: true, data: created });
    } catch (err) {
        res.status(500).json({ 
            success: false, message: err.message });
    }
});

// POST /api/menu/assign-codes
router.post('/assign-codes', 
    protect, requireRole('manager'),
    async (req, res) => {
    try {
        const items = await Menu.find({
            restaurantId: req.user.restaurantId
        }).sort({ category: 1, name: 1 });

        const taken = items
            .filter(i => i.code)
            .map(i => i.code);

        let counter = 1;
        for (const item of items) {
            if (!item.code) {
                while (taken.includes(counter)) {
                    counter++;
                }
                item.code = counter;
                taken.push(counter);
                counter++;
                await item.save();
            }
        }

        const updated = await Menu.find({
            restaurantId: req.user.restaurantId
        }).sort({ code: 1 });

        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ 
            success: false, message: err.message });
    }
});

// POST /api/menu/deduplicate
// Removes duplicate menu items keeping only 
// the first occurrence of each item name
router.post('/deduplicate',
    protect, requireRole('manager'),
    async (req, res) => {
        try {
            const items = await Menu.find({
                restaurantId: req.user.restaurantId
            }).sort({ createdAt: 1 });

            const seen = new Set();
            const toDelete = [];

            for (const item of items) {
                const key = item.name.toLowerCase().trim();
                if (seen.has(key)) {
                    toDelete.push(item._id);
                } else {
                    seen.add(key);
                }
            }

            if (toDelete.length > 0) {
                await Menu.deleteMany({ 
                    _id: { $in: toDelete } 
                });
            }

            res.json({ 
                success: true, 
                message: `Removed ${toDelete.length} 
duplicates`,
                deleted: toDelete.length
            });
        } catch (err) {
            res.status(500).json({ 
                success: false, 
                message: err.message 
            });
        }
    }
);


// POST /api/menu/reset-codes
// Clears ALL codes then reassigns 1,2,3...
// in alphabetical order within each category
router.post('/reset-codes',
    protect, requireRole('manager'),
    async (req, res) => {
        try {
            // Step 1 — clear all existing codes
            await Menu.updateMany(
                { restaurantId: req.user.restaurantId },
                { $set: { code: null } }
            );

            // Step 2 — fetch all items sorted 
            // alphabetically by name
            const items = await Menu.find({
                restaurantId: req.user.restaurantId
            }).sort({ name: 1 });

            // Step 3 — assign clean 1,2,3...
            let counter = 1;
            for (const item of items) {
                item.code = counter++;
                await item.save();
            }

            const updated = await Menu.find({
                restaurantId: req.user.restaurantId
            }).sort({ code: 1 });

            res.json({ 
                success: true, 
                data: updated 
            });
        } catch (err) {
            res.status(500).json({ 
                success: false, 
                message: err.message 
            });
        }
    }
);

// DELETE /api/menu/all
router.delete('/all', protect, 
    requireRole('manager'), async (req, res) => {
    try {
        await Menu.deleteMany({ 
            restaurantId: req.user.restaurantId 
        });
        res.json({ 
            success: true, 
            message: 'All menu items cleared' 
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, message: err.message });
    }
});

// PATCH /api/menu/:id/code
router.patch('/:id/code', 
    protect, requireRole('manager'),
    async (req, res) => {
    try {
        const { code } = req.body;
        if (code) {
            const existing = await Menu.findOne({
                restaurantId: req.user.restaurantId,
                code: code,
                _id: { $ne: req.params.id }
            });
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: `Code ${code} already 
used by ${existing.name}`
                });
            }
        }
        const item = await Menu.findOneAndUpdate(
            { 
                _id: req.params.id, 
                restaurantId: req.user.restaurantId 
            },
            { code: code || null },
            { new: true }
        );
        if (!item) return res.status(404).json({ 
            success: false, 
            message: 'Item not found' 
        });
        res.json({ success: true, data: item });
    } catch (err) {
        res.status(500).json({ 
            success: false, message: err.message });
    }
});

// PUT /api/menu/:id
router.put('/:id', protect, requireRole('manager'), 
    async (req, res) => {
    try {
        const updateData = {};
        if (req.body.name !== undefined) 
            updateData.name = req.body.name;
        if (req.body.category !== undefined) 
            updateData.category = req.body.category;
        if (req.body.price !== undefined) 
            updateData.price = req.body.price;
        if (req.body.disabled !== undefined) 
            updateData.disabled = req.body.disabled;

        const item = await Menu.findOneAndUpdate(
            { 
                _id: req.params.id, 
                restaurantId: req.user.restaurantId 
            },
            updateData,
            { new: true, runValidators: true }
        );
        if (!item) return res.status(404).json({ 
            success: false, 
            message: 'Item not found' 
        });
        res.json({ success: true, data: item });
    } catch (err) {
        res.status(500).json({ 
            success: false, message: err.message });
    }
});

// DELETE /api/menu/:id
router.delete('/:id', protect, 
    requireRole('manager'), async (req, res) => {
    try {
        const item = await Menu.findOneAndDelete({ 
            _id: req.params.id, 
            restaurantId: req.user.restaurantId 
        });
        if (!item) return res.status(404).json({ 
            success: false, 
            message: 'Item not found' 
        });
        res.json({ success: true, message: 'Item removed' });
    } catch (err) {
        res.status(500).json({ 
            success: false, message: err.message });
    }
});

module.exports = router;
