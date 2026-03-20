const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

const clients = new Map();

// Support token as query param for EventSource
router.get('/stream', async (req, res, next) => {
    if (req.query.token && !req.headers.authorization) {
        req.headers.authorization = `Bearer ${req.query.token}`;
    }
    next();
}, protect, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const rid = req.user.restaurantId.toString();
    if (!clients.has(rid)) clients.set(rid, []);
    clients.get(rid).push(res);

    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 25000);

    req.on('close', () => {
        clearInterval(heartbeat);
        const list = clients.get(rid) || [];
        clients.set(rid, list.filter(r => r !== res));
    });
});

function broadcast(restaurantId, eventData) {
    const list = clients.get(restaurantId.toString()) || [];
    const payload = `data: ${JSON.stringify(eventData)}\n\n`;
    list.forEach(res => {
        try { res.write(payload); } catch(e) {}
    });
}

module.exports = { router, broadcast };
