require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');
const settingsRoutes = require('./routes/settings');
const analyticsRoutes = require('./routes/analytics');
const staffRoutes = require('./routes/staff');
const { router: notiRoutes } = require('./routes/notifications');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ────────────────────────────────────────
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit: '5mb' }));  // 5mb for logo base64
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────
app.get('/health', (req, res) => {
    const dbReady = mongoose.connection.readyState === 1;
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    res.status(dbReady ? 200 : 503).json({
        status: dbReady ? 'ok' : 'degraded',
        service: 'VoxBill Backend',
        db: {
            ready: dbReady,
            state: states[mongoose.connection.readyState] || 'unknown'
        },
        timestamp: new Date()
    });
});

app.get('/rishi-test', (req, res) => {
    res.json({
        success: true,
        message: 'Rishi test route working'
    });
});

// ── Routes ────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/notifications', notiRoutes);

// AI Voice Order Proxy route
app.post('/order', async (req, res) => {
    try {
        const { text, token } = req.body;
        // Forward to Python AI service on port 5000
        const response = await fetch('http://127.0.0.1:5000/process-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, token })
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('AI Proxy Error:', err.message);
        res.status(500).json({ error: 'AI service unreachable' });
    }
});

// ── 404 handler ───────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ──────────────────────────────
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

async function startServer() {
    try {
        await connectDB();

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`VoxBill Backend running on port ${PORT}`);
        });

    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

startServer();


