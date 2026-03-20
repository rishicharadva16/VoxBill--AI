const express      = require('express');
const router       = express.Router();
const OrderHistory = require('../models/OrderHistory');
const { protect, requireRole } = require('../middleware/authMiddleware');

/* ─────────────────────────────────────────
   GET /history – paginated order history
   Query: page, limit, search, waiter,
          dateFrom, dateTo, minAmount, maxAmount
───────────────────────────────────────── */
router.get('/', protect, requireRole('manager'), async (req, res) => {
    try {
        const page  = parseInt(req.query.page)  || 1;
        const limit = parseInt(req.query.limit) || 25;
        const skip  = (page - 1) * limit;

        const filter = { restaurantId: req.user.restaurantId };

        if (req.query.search) {
            const q = req.query.search;
            filter.$or = [
                { customerName:  { $regex: q, $options: 'i' } },
                { invoiceNumber: { $regex: q, $options: 'i' } },
                { waiterName:    { $regex: q, $options: 'i' } }
            ];
        }
        if (req.query.waiter) {
            filter.waiterName = { $regex: req.query.waiter, $options: 'i' };
        }
        if (req.query.dateFrom || req.query.dateTo) {
            filter.paidAt = {};
            if (req.query.dateFrom) filter.paidAt.$gte = new Date(req.query.dateFrom);
            if (req.query.dateTo)   filter.paidAt.$lte = new Date(req.query.dateTo + 'T23:59:59');
        }
        if (req.query.minAmount) {
            filter.grandTotal = { $gte: Number(req.query.minAmount) };
        }
        if (req.query.maxAmount) {
            filter.grandTotal = {
                ...filter.grandTotal,
                $lte: Number(req.query.maxAmount)
            };
        }

        const [records, total] = await Promise.all([
            OrderHistory.find(filter).sort({ paidAt: -1 }).skip(skip).limit(limit),
            OrderHistory.countDocuments(filter)
        ]);

        res.json({
            success: true,
            records,
            total,
            page,
            pages: Math.ceil(total / limit)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ─────────────────────────────────────────
   GET /history/stats/summary – dashboard stats
   Must be defined BEFORE /:id to avoid route conflict
───────────────────────────────────────── */
router.get('/stats/summary', protect, requireRole('manager'), async (req, res) => {
    try {
        const rid = req.user.restaurantId;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [todayStats, allTimeStats, topWaiter] = await Promise.all([
            OrderHistory.aggregate([
                { $match: { restaurantId: rid, paidAt: { $gte: today } } },
                { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
            ]),
            OrderHistory.aggregate([
                { $match: { restaurantId: rid } },
                { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
            ]),
            OrderHistory.aggregate([
                { $match: { restaurantId: rid } },
                { $group: { _id: '$waiterName', total: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
                { $sort: { total: -1 } },
                { $limit: 1 }
            ])
        ]);

        res.json({
            success: true,
            today: {
                revenue: todayStats[0]?.total || 0,
                orders:  todayStats[0]?.count || 0
            },
            allTime: {
                revenue: allTimeStats[0]?.total || 0,
                orders:  allTimeStats[0]?.count || 0
            },
            topWaiter: topWaiter[0] || null
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ─────────────────────────────────────────
   GET /history/:id – single history record
───────────────────────────────────────── */
router.get('/:id', protect, requireRole('manager'), async (req, res) => {
    try {
        const record = await OrderHistory.findOne({
            _id: req.params.id,
            restaurantId: req.user.restaurantId
        });
        if (!record) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, data: record });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
