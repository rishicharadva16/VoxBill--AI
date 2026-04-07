const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

const AI_SERVICE_URL = process.env.AI_URL
    || 'http://127.0.0.1:5000/process-order';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Global Request Logger ───────────────────────────
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Root redirect to login page
app.get('/', (req, res) => {
    res.redirect('/pages/login.html');
});

// ── API Proxy Logic ──────────────────────────────────
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:4000';

// ── SSE Proxy Bypass (must come BEFORE generic /api proxy) ──
app.get('/api/notifications/stream', (req, res) => {
    const token = (req.headers['authorization'] || '')
        .replace('Bearer ', '') || req.query.token || '';
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const proxyReq = http.request(
        `${BACKEND_URL}/notifications/stream?token=${encodeURIComponent(token)}`,
        { headers: { 'Accept': 'text/event-stream' } },
        (proxyRes) => {
            proxyRes.pipe(res);
            req.on('close', () => proxyReq.destroy());
        }
    );
    proxyReq.on('error', () => res.end());
    proxyReq.end();
});

// Registered routes to proxy (Unified Gateway)
app.use('/api', async (req, res) => {
    console.log(`[Proxy] ${req.method} ${req.url}`);
    try {
        const method = req.method;
        let backendPath = req.url; // This is the path after /api
        
        // Specific mapping for Problem 2: /api/restaurants -> /auth/restaurants
        if (backendPath === '/restaurants' || backendPath === '/restaurants/') {
            backendPath = '/auth/restaurants';
        }

        const body = ['POST', 'PUT', 'PATCH'].includes(method) ? JSON.stringify(req.body) : undefined;
        
        const response = await fetch(`${BACKEND_URL}${backendPath}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers['authorization'] || ''
            },
            body
        });

        const data = await response.json().catch(() => ({}));
        console.log(`[Proxy] Response: ${response.status}`);
        res.status(response.status).json(data);
    } catch (error) {
        console.error(`Proxy error for ${req.originalUrl}:`, error.message);
        res.status(502).json({ success: false, message: "Backend service unreachable" });
    }
});

// Forward /order request to Python service (Fix 4: forward token)
app.post('/order', async (req, res) => {
    try {
        const { text, token } = req.body;
        const response = await fetch(AI_SERVICE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, token })
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        res.status(500).json({ error: "AI service unreachable" });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Node Server is running closely at http://0.0.0.0:${PORT}`);
});
