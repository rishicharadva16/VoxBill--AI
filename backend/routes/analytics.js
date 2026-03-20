const express = require('express');
const Order   = require('../models/Order');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

/* ─────────────────────────────────────────
   GET /analytics
   Query: ?days=1 (default) | 7 | 30
   Returns KPIs + hourly + daily + topItems
───────────────────────────────────────── */
router.get('/', protect, async (req, res) => {
    try {
        const days     = parseInt(req.query.days) || 1;
        const restaurantId = req.user.restaurantId;

        // Date range
        const since = days === 1
            ? new Date(new Date().setHours(0, 0, 0, 0))
            : new Date(Date.now() - days * 86400000);

        const filter = { restaurantId, status: 'paid', createdAt: { $gte: since } };

        /* ── KPIs ── */
        const orders = await Order.find(filter).lean();
        const totalOrders  = orders.length;
        const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
        const avgOrderVal  = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        /* ── Most ordered item ── */
        const itemCounts = {};
        orders.forEach(o => {
            (o.items || []).forEach(i => {
                itemCounts[i.item] = (itemCounts[i.item] || 0) + i.qty;
            });
        });
        const topItemName  = Object.keys(itemCounts).sort((a, b) => itemCounts[b] - itemCounts[a])[0] || null;
        const topItemCount = topItemName ? itemCounts[topItemName] : 0;

        /* ── Orders by hour (today only) ── */
        const hourlyBuckets = Array(24).fill(0);
        if (days === 1) {
            orders.forEach(o => {
                const h = new Date(o.createdAt).getHours();
                hourlyBuckets[h]++;
            });
        }

        /* ── Revenue by day ── */
        const revenueByDay = [];
        for (let d = days - 1; d >= 0; d--) {
            const dayStart = new Date(); dayStart.setDate(dayStart.getDate() - d); dayStart.setHours(0,0,0,0);
            const dayEnd   = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
            const dayOrders = orders.filter(o => {
                const t = new Date(o.createdAt);
                return t >= dayStart && t < dayEnd;
            });
            revenueByDay.push({
                label:   dayStart.toLocaleDateString('en-IN', { day:'2-digit', month:'short' }),
                revenue: dayOrders.reduce((s, o) => s + o.total, 0),
                count:   dayOrders.length
            });
        }

        /* ── Top selling items ── */
        const topItems = Object.entries(itemCounts)
            .sort(([,a],[,b]) => b - a)
            .slice(0, 8)
            .map(([name, qty]) => ({ name, qty }));

        res.json({
            success: true,
            data: {
                totalOrders,
                totalRevenue: parseFloat(totalRevenue.toFixed(2)),
                avgOrderVal:  parseFloat(avgOrderVal.toFixed(2)),
                topItem:      topItemName ? { name: topItemName, count: topItemCount } : null,
                hourlyBuckets,
                revenueByDay,
                topItems
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
