const express    = require('express');
const jwt        = require('jsonwebtoken');
const User       = require('../models/User');
const Restaurant = require('../models/Restaurant');
const Settings   = require('../models/Settings');

const router = express.Router();

const signToken = (id) =>
    jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '24h' });

/* ─────────────────────────────────────────
   POST /auth/register
   Body: { name, email, password, role, restaurantName }
───────────────────────────────────────── */
router.post('/register', async (req, res) => {
    try {
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
   GET /auth/staff/:restaurantId
   Used for Waiter Selection Login
───────────────────────────────────────── */
router.get('/staff/:id', async (req, res) => {
    try {
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
