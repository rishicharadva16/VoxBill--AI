const express    = require('express');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const mongoose   = require('mongoose');
const User       = require('../models/User');
const Restaurant = require('../models/Restaurant');
const Settings   = require('../models/Settings');

const router = express.Router();

const signToken = (id) =>
    jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '24h' });

const RESET_TOKEN_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 30);
const ALLOW_DIRECT_PASSWORD_RESET = (process.env.ALLOW_DIRECT_PASSWORD_RESET || 'true').toLowerCase() !== 'false';

function ensureDbReady(res) {
    // 1 = connected
    if (mongoose.connection.readyState === 1) return true;
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    res.status(503).json({
        success: false,
        code: 'DB_UNAVAILABLE',
        message: 'Database unavailable. Please retry in a moment.',
        dbState: states[mongoose.connection.readyState] || 'unknown'
    });
    return false;
}

function buildMailTransport() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return null;
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
}

const mailTransport = buildMailTransport();

function buildResetLink(rawToken) {
    const base = (process.env.FRONTEND_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
    return `${base}/pages/reset-password.html?token=${encodeURIComponent(rawToken)}`;
}

async function sendResetEmail(email, link) {
    if (!mailTransport) {
        console.log(`[PasswordReset] SMTP not configured. Reset link for ${email}: ${link}`);
        return;
    }

    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    await mailTransport.sendMail({
        from,
        to: email,
        subject: 'VoxBill password reset',
        text: `Use this link to reset your VoxBill password: ${link}\n\nThis link expires in ${RESET_TOKEN_TTL_MINUTES} minutes.`,
        html: `<p>Use this link to reset your VoxBill password:</p><p><a href="${link}">${link}</a></p><p>This link expires in ${RESET_TOKEN_TTL_MINUTES} minutes.</p>`
    });
}

/* ─────────────────────────────────────────
   POST /auth/register
   Body: { name, email, password, role, restaurantName }
───────────────────────────────────────── */
router.post('/register', async (req, res) => {
    try {
        if (!ensureDbReady(res)) return;

        const { name, email, password, role = 'waiter', restaurantName } = req.body;
        if (!name || (role === 'manager' && !email) || !password) {
            return res.status(400).json({ success: false, message: 'name, email (for manager), and password required' });
        }

        if (email) {
            const exists = await User.findOne({ email });
            if (exists) return res.status(409).json({ success: false, message: 'Email already registered' });
        }

        // Create restaurant if manager is registering
        let restaurant = null;
        if (role === 'manager' && restaurantName) {
            restaurant = await Restaurant.create({ name: restaurantName });
            await Settings.create({ restaurantId: restaurant._id, restaurantName });
        }

        const user = await User.create({
            name, email, password, role,
            restaurantId: restaurant ? restaurant._id : undefined
        });

        res.status(201).json({
            success: true,
            token: signToken(user._id),
            user: { id: user._id, name: user.name, email: user.email, role: user.role,
                    restaurantId: user.restaurantId }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ─────────────────────────────────────────
   POST /auth/login
   Body: { email, password }
───────────────────────────────────────── */
router.post('/login', async (req, res) => {
    try {
        if (!ensureDbReady(res)) return;

        const { email, username, password } = req.body;
        if ((!email && !username) || !password)
            return res.status(400).json({ success: false, message: 'ID (email/username) and password required' });

        const query = email ? { email } : { username };
        const user = await User.findOne(query);
        
        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        res.json({
            success: true,
            token: signToken(user._id),
            user: { id: user._id, name: user.name, email: user.email, username: user.username, role: user.role,
                    restaurantId: user.restaurantId }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ─────────────────────────────────────────
   POST /auth/forgot-password
   Body: { email }
───────────────────────────────────────── */
router.post('/forgot-password', async (req, res) => {
    try {
        if (!ensureDbReady(res)) return;

        const genericResponse = {
            success: true,
            message: 'If the account exists, a password reset link has been sent.'
        };

        const identifier = (req.body.email || req.body.username || '').toString().trim();
        if (!identifier) {
            return res.json(genericResponse);
        }

        const normalized = identifier.toLowerCase();
        const isEmailLike = normalized.includes('@');
        const user = await User.findOne(
            isEmailLike
                ? { email: normalized }
                : { $or: [{ username: normalized }, { email: normalized }] }
        );

        if (!user) {
            return res.json(genericResponse);
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        user.passwordResetTokenHash = hashedToken;
        user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
        await user.save();

        const resetLink = buildResetLink(rawToken);
        if (user.email) {
            await sendResetEmail(user.email, resetLink);
        }

        return res.json({
            success: true,
            message: 'Reset link generated. Use the link below to update password.',
            resetLink
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ─────────────────────────────────────────
   POST /auth/reset-password/:token
   Body: { password }
───────────────────────────────────────── */
router.post('/reset-password/:token', async (req, res) => {
    try {
        if (!ensureDbReady(res)) return;

        const rawToken = (req.params.token || '').trim();
        const nextPassword = (req.body.password || '').toString();

        if (!rawToken) {
            return res.status(400).json({ success: false, message: 'Reset token is required' });
        }

        if (!nextPassword || nextPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
        const user = await User.findOne({
            passwordResetTokenHash: hashedToken,
            passwordResetExpiresAt: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ success: false, message: 'Reset link is invalid or expired' });
        }

        user.password = nextPassword;
        user.passwordResetTokenHash = null;
        user.passwordResetExpiresAt = null;
        await user.save();

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ─────────────────────────────────────────
   POST /auth/reset-password-direct
   Body: { identifier, password }
   Internal fallback for environments without real email delivery.
───────────────────────────────────────── */
router.post('/reset-password-direct', async (req, res) => {
    try {
        if (!ensureDbReady(res)) return;

        if (!ALLOW_DIRECT_PASSWORD_RESET) {
            return res.status(403).json({
                success: false,
                code: 'DIRECT_RESET_DISABLED',
                message: 'Direct password reset is disabled in this environment.'
            });
        }

        const identifier = (req.body.identifier || req.body.email || req.body.username || '').toString().trim().toLowerCase();
        const nextPassword = (req.body.password || '').toString();

        if (!identifier) {
            return res.status(400).json({ success: false, message: 'Email or username is required' });
        }

        if (!nextPassword || nextPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const query = identifier.includes('@')
            ? { email: identifier }
            : { $or: [{ username: identifier }, { email: identifier }] };

        const user = await User.findOne(query);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Account not found for this identifier' });
        }

        user.password = nextPassword;
        user.passwordResetTokenHash = null;
        user.passwordResetExpiresAt = null;
        await user.save();

        return res.json({ success: true, message: 'Password reset successfully. Please login with new password.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/* ─────────────────────────────────────────
   GET /auth/staff/:restaurantId
   Used for Waiter Selection Login
───────────────────────────────────────── */
router.get('/staff/:id', async (req, res) => {
    try {
        if (!ensureDbReady(res)) return;

        const staff = await User.find({ 
            restaurantId: req.params.id, 
            role: 'waiter' 
        }).select('name username').lean();
        
        res.json({ success: true, data: staff });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ─────────────────────────────────────────
   GET /auth/restaurants
   Public: List all restaurants for waiter login
   ───────────────────────────────────────── */
router.get('/restaurants', async (req, res) => {
    try {
        if (!ensureDbReady(res)) return;

        const restaurants = await Restaurant.find({}).select('name').sort({ name: 1 }).lean();
        res.json({ success: true, data: restaurants });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ─────────────────────────────────────────
   GET /auth/restaurants/:id
   Public: Get direct restaurant info by ID
   ───────────────────────────────────────── */
router.get('/restaurants/:id', async (req, res) => {
    try {
        if (!ensureDbReady(res)) return;

        const restaurant = await Restaurant.findById(req.params.id).select('name address phone').lean();
        if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found' });
        res.json({ success: true, data: restaurant });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ─────────────────────────────────────────
   POST /auth/staff-restaurant
   Fix 17: PIN-based restaurant lookup for waiters
───────────────────────────────────────── */
router.post('/staff-restaurant', async (req, res) => {
    try {
        if (!ensureDbReady(res)) return;

        const { pin } = req.body;
        if (!pin || pin.trim().length < 4) {
            return res.status(400).json({
                success: false,
                message: 'Enter a valid PIN (minimum 4 digits)'
            });
        }
        const settings = await Settings
            .findOne({ restaurantPin: pin.trim() })
            .populate('restaurantId', 'name');

        if (!settings || !settings.restaurantId) {
            return res.status(404).json({
                success: false,
                message: 'No restaurant found with this PIN'
            });
        }
        res.json({
            success: true,
            data: {
                restaurantId: settings.restaurantId._id,
                name: settings.restaurantId.name
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
