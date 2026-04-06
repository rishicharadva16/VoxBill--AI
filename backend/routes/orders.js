const express = require('express');
const Order   = require('../models/Order');
const OrderHistory = require('../models/OrderHistory');
const Settings = require('../models/Settings');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { broadcast } = require('./notifications');

const router = express.Router();
const RUSH_OCR_AI_URL = process.env.RUSH_OCR_AI_URL || 'http://127.0.0.1:5000/process-rush-image';

/* ─────────────────────────────────────────
   POST /orders/rush-ocr – API OCR for Rush slips
───────────────────────────────────────── */
router.post('/rush-ocr', protect, async (req, res) => {
    try {
        const { imageBase64, mimeType } = req.body || {};
        if (!imageBase64 || typeof imageBase64 !== 'string') {
            return res.status(400).json({ success: false, message: 'imageBase64 is required' });
        }

        const allowedTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
        const safeMimeType = (mimeType || 'image/jpeg').toLowerCase();
        if (!allowedTypes.has(safeMimeType)) {
            return res.status(400).json({ success: false, message: 'Unsupported image mimeType' });
        }

        // Approximate raw bytes from base64 length.
        const approxBytes = Math.floor((imageBase64.length * 3) / 4);
        const maxBytes = 6 * 1024 * 1024;
        if (approxBytes > maxBytes) {
            return res.status(413).json({ success: false, message: 'Image too large (max 6MB)' });
        }

        const today = new Date().toISOString().slice(0, 10);
        let settings = await Settings.findOne({ restaurantId: req.user.restaurantId });
        if (!settings) {
            settings = await Settings.create({ restaurantId: req.user.restaurantId });
        }

        if (settings.rushOcrUsageDate !== today) {
            settings.rushOcrUsageDate = today;
            settings.rushOcrUsageCount = 0;
            await settings.save();
        }

        const cap = Number.isFinite(settings.rushOcrDailyCap)
            ? settings.rushOcrDailyCap
            : 100;
        if (settings.rushOcrUsageCount >= cap) {
            return res.status(429).json({
                success: false,
                message: `Rush OCR daily limit reached (${cap}/${cap})`
            });
        }

        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        const aiRes = await fetch(RUSH_OCR_AI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageBase64,
                mimeType: safeMimeType,
                token,
                backendUrl: process.env.BACKEND_URL || 'http://127.0.0.1:4000'
            })
        });

        const aiJson = await aiRes.json().catch(() => ({}));
        if (!aiRes.ok) {
            return res.status(aiRes.status || 502).json({
                success: false,
                message: aiJson.error || aiJson.message || 'Rush OCR service failed',
                details: aiJson
            });
        }

        settings.rushOcrUsageCount += 1;
        await settings.save();

        return res.json({
            success: true,
            data: aiJson,
            usage: {
                date: settings.rushOcrUsageDate,
                used: settings.rushOcrUsageCount,
                cap: cap
            }
        });
    } catch (err) {
        console.error('Rush OCR Error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Rush OCR failed',
            error: err.message
        });
    }
});

/* ─────────────────────────────────────────
   GET /orders/tables/status – Live Table status
   Fix 21: Returns createdBy for occupied tables
───────────────────────────────────────── */
router.get('/tables/status', protect, async (req, res) => {
    try {
        const openOrders = await Order.find({ 
            restaurantId: req.user.restaurantId, 
            status: { $in: ['draft', 'ordering', 'ready_for_billing'] } 
        });

        const tableStatus = {};
        openOrders.forEach(o => {
            tableStatus[o.tableNumber] = {
                status: o.status,
                createdBy: o.createdBy ? o.createdBy.toString() : null,
                orderId: o._id
            };
        });

        // For available tables, keep as object with status 'available'
        for (let i = 1; i <= 20; i++) {
            if (!tableStatus[i]) tableStatus[i] = { status: 'available' };
        }

        res.json({ success: true, data: tableStatus });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ─────────────────────────────────────────
   POST /orders – create or append to an order
   Fixes 5, 7, 8, 12, 14
───────────────────────────────────────── */
router.post('/', protect, async (req, res) => {
    try {
        const { tableNumber, items, subtotal, discountAmt, gst, total, customerName } = req.body;
        
        if (!tableNumber || tableNumber === '?')
            return res.status(400).json({ success: false, message: 'valid tableNumber required' });
        // Allow empty items for draft saves
        if ((!items || items.length === 0) && req.body.status !== 'draft' && req.body.status !== 'ordering')
            return res.status(400).json({ success: false, message: 'items array required' });

        // Fix 7: Waiter status restriction (now includes draft)
        const WAITER_ALLOWED = ['draft', 'ordering', 'ready_for_billing'];
        const requested = req.body.status;

        // Search for an active order for this table (includes draft)
        let order = await Order.findOne({ 
            restaurantId: req.user.restaurantId, 
            tableNumber: Number(tableNumber), 
            status: { $in: ['draft', 'ordering', 'ready_for_billing'] } 
        });

        if (order) {
            const previousStatus = order.status;
            // If items provided, replace items entirely (not append) for draft/ordering updates
            if (items && items.length > 0) {
                order.items = items;
            }
            // Fix 7: Status restriction for waiters (includes draft)
            order.status = (req.user.role === 'manager' && requested)
                ? requested
                : (WAITER_ALLOWED.includes(requested) ? requested : 'ordering');
            // Fix 5: Update customerName if provided
            if (customerName !== undefined) order.customerName = customerName;
            if (req.body.notes !== undefined) order.notes = req.body.notes;
            // Update waiter assignment to whoever is currently editing
            order.waiterName = req.user.name || order.waiterName;
            // Recalculate totals
            order.subtotal = order.items.reduce((s, i) => s + i.total, 0);
            if (discountAmt !== undefined) order.discountAmt = discountAmt;
            if (gst !== undefined) order.gst = gst;
            order.total = total !== undefined ? total : (order.subtotal - (order.discountAmt || 0) + (order.gst || 0));
            await order.save();

            // Only broadcast when status transitions TO ready_for_billing
            // Do NOT broadcast on every draft/ordering update (prevents duplicate notifications)
            if (order.status === 'ready_for_billing' && previousStatus !== 'ready_for_billing') {
                broadcast(req.user.restaurantId, {
                    type: 'ready_for_billing',
                    tableNumber: order.tableNumber,
                    customerName: order.customerName || '',
                    waiterName: req.user.name,
                    itemCount: order.items.length,
                    orderId: order._id
                });
            }

            return res.json({ success: true, message: 'Order updated', data: order });
        } else {
            // Fix 14: Generate sequential invoice number
            const updatedSettings = await Settings.findOneAndUpdate(
                { restaurantId: req.user.restaurantId },
                { $inc: { invoiceCounter: 1 } },
                { new: true, upsert: true }
            );
            const invoiceNumber = `INV-${String(updatedSettings.invoiceCounter).padStart(4, '0')}`;

            // Fix 7: Status restriction for waiters
            const newStatus = (req.user.role === 'manager' && requested)
                ? requested
                : (WAITER_ALLOWED.includes(requested) ? requested : 'ordering');

            order = await Order.create({
                restaurantId: req.user.restaurantId,
                tableNumber: Number(tableNumber),
                customerName: customerName || '',
                waiterName: req.user.name || '',
                invoiceNumber: invoiceNumber,
                items,
                subtotal: subtotal || (items ? items.reduce((s, i) => s + i.total, 0) : 0),
                discountAmt: discountAmt || 0,
                gst: gst || 0,
                total: total || (subtotal || (items ? items.reduce((s, i) => s + i.total, 0) : 0)),
                notes: req.body.notes || '',
                status: newStatus,
                createdBy: req.user._id
            });

            // Determine which event type to broadcast
            const broadcastType =
                order.status === 'ready_for_billing'
                ? 'ready_for_billing'
                : 'new_order';

            broadcast(req.user.restaurantId, {
                type: broadcastType,
                tableNumber: order.tableNumber,
                customerName: order.customerName || '',
                waiterName: req.user.name,
                itemCount: order.items.length,
                orderId: order._id
            });

            res.status(201).json({ success: true, message: 'New order opened', data: order });
        }
    } catch (err) {
        console.error('Order Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ─────────────────────────────────────────
   PATCH /orders/:id/pay – Settle and close order
   Fix 12: Broadcast payment event
   + Snapshot to OrderHistory
───────────────────────────────────────── */
router.patch('/:id/pay', protect, async (req, res) => {
    try {
        const { discountAmt, gst, total } = req.body;
        const order = await Order.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
        
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.status === 'paid') return res.status(400).json({ success: false, message: 'Order already paid' });

        order.status = 'paid';
        if (discountAmt !== undefined) order.discountAmt = discountAmt;
        if (gst !== undefined) order.gst = gst;
        if (total !== undefined) order.total = total;

        await order.save();

        // ── Snapshot to OrderHistory ──────────────
        try {
            const historyItems = (order.items || []).map(i => ({
                name:  i.item,
                qty:   i.qty || 1,
                price: i.price,
                total: i.total || (i.price * (i.qty || 1))
            }));

            const historySubtotal = historyItems.reduce((sum, i) => sum + i.total, 0);

            const history = new OrderHistory({
                orderId:        order._id,
                restaurantId:   order.restaurantId,
                tableNumber:    order.tableNumber,
                customerName:   order.customerName || 'Guest',
                waiterName:     order.waiterName || 'Unknown',
                waiterId:       order.createdBy,
                items:          historyItems,
                subtotal:       order.subtotal || historySubtotal,
                gstAmount:      order.gst || 0,
                discountAmount: order.discountAmt || 0,
                grandTotal:     order.total,
                paymentMethod:  req.body.paymentMethod || 'cash',
                paidAt:         new Date()
            });

            await history.save();
        } catch (histErr) {
            // History save failure should never block the paid response
            console.error('OrderHistory save error:', histErr.message);
        }

        // Fix 12: Broadcast payment event
        broadcast(req.user.restaurantId, {
            type: 'order_paid',
            tableNumber: order.tableNumber,
            total: order.total,
            orderId: order._id
        });

        res.json({ success: true, message: 'Order settled', data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ─────────────────────────────────────────
   GET /orders – list orders
   Fix 6: Waiters only see their own orders
───────────────────────────────────────── */
router.get('/', protect, async (req, res) => {
    try {
        const filter = { restaurantId: req.user.restaurantId };
        const { range, table, status } = req.query;

        if (status) filter.status = status;
        
        const now = new Date();
        if (range === 'today') {
            filter.createdAt = { $gte: new Date(now.setHours(0,0,0,0)) };
        } else if (range === '7') {
            filter.createdAt = { $gte: new Date(Date.now() - 7 * 86400000) };
        }

        if (table) filter.tableNumber = Number(table);

        // Fix 6: Waiter sees their own COMPLETED orders, but ALL draft/ordering orders
        if (req.user.role === 'waiter') {
            filter.$or = [
                { createdBy: req.user._id },
                { status: { $in: ['draft', 'ordering'] } }
            ];
        }

        const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ─────────────────────────────────────────
   DELETE /orders/all – Clear all orders (manager only)
   Fix 19
───────────────────────────────────────── */
router.delete('/all', protect, requireRole('manager'), async (req, res) => {
    try {
        await Order.deleteMany({ restaurantId: req.user.restaurantId });
        res.json({ success: true, message: 'All orders cleared' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ─────────────────────────────────────────
   PATCH /orders/:id – modify order (manager/remote actions)
───────────────────────────────────────── */
router.patch('/:id', protect, async (req, res) => {
    try {
        const { status, waiterName, discountAmt, gst, total, notes, customerName } = req.body;
        const order = await Order.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
        
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        
        // Waiters shouldn't remotely cancel or reassign orders randomly
        if (req.user.role !== 'manager' && status === 'cancelled') {
            return res.status(403).json({ success: false, message: 'Only managers can cancel orders' });
        }

        if (status !== undefined) order.status = status;
        if (waiterName !== undefined) order.waiterName = waiterName;
        if (discountAmt !== undefined) order.discountAmt = discountAmt;
        if (gst !== undefined) order.gst = gst;
        if (total !== undefined) order.total = total;
        if (notes !== undefined) order.notes = notes;
        if (customerName !== undefined) order.customerName = customerName;

        await order.save();

        // Broadcast a generic order update event to connected clients
        const eventType = status === 'cancelled' ? 'order_cancelled' : 'order_updated';
        broadcast(req.user.restaurantId, {
            type: eventType,
            tableNumber: order.tableNumber,
            orderId: order._id,
            status: order.status
        });

        res.json({ success: true, message: 'Order updated', data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ─────────────────────────────────────────
   GET /orders/:id – single order
───────────────────────────────────────── */
router.get('/:id', protect, async (req, res) => {
    try {
        const order = await Order.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
