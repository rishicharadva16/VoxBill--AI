const express  = require('express');
const Settings = require('../models/Settings');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

/* GET /settings – return settings for restaurant */
router.get('/', protect, async (req, res) => {
    try {
        let settings = await Settings.findOne({ restaurantId: req.user.restaurantId });
        if (!settings) {
            // Auto-create default settings
            settings = await Settings.create({ restaurantId: req.user.restaurantId });
        }
        res.json({ success: true, data: settings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* POST /settings – upsert settings (manager only) */
router.post('/', protect, requireRole('manager'), async (req, res) => {
    try {
        const allowed = [
            'restaurantName', 'address', 'phone', 'email', 'gstNumber', 'upiId',
            'gstEnabled', 'gstPercent', 'invoiceTemplate', 'footerMsg', 'logoDataUrl',
            'restaurantPin'
        ];
        const update = {};
        allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

        const settings = await Settings.findOneAndUpdate(
            { restaurantId: req.user.restaurantId },
            { $set: update },
            { new: true, upsert: true, runValidators: true }
        );
        res.json({ success: true, data: settings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
