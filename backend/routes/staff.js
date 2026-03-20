const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, requireRole } = require('../middleware/authMiddleware');

/**
 * @route   GET /staff
 * @desc    Get all staff members for the restaurant
 * @access  Private (Manager only)
 */
router.get('/', protect, requireRole('manager'), async (req, res) => {
    try {
        const staff = await User.find({ restaurantId: req.user.restaurantId })
            .select('-password')
            .sort({ createdAt: -1 });
        res.json({ success: true, count: staff.length, data: staff });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * @route   POST /staff
 * @desc    Add a new waiter account
 * @access  Private (Manager only)
 */
router.post('/', protect, requireRole('manager'), async (req, res) => {
    try {
        const { name, username, email, password } = req.body;

        if (!name || !username || !password) {
            return res.status(400).json({ success: false, message: 'name, username, and password required' });
        }

        // Check if username exists globally
        const userExists = await User.findOne({ username });
        if (userExists) {
            return res.status(400).json({ success: false, message: 'Username (Waiter ID) already exists' });
        }

        // Create user (forced to waiter role)
        const user = await User.create({
            name,
            username,
            email: email || undefined,
            password,
            role: 'waiter',
            restaurantId: req.user.restaurantId
        });

        if (user) {
            res.status(201).json({
                success: true,
                data: {
                    _id: user._id,
                    name: user.name,
                    username: user.username,
                    role: user.role,
                    createdAt: user.createdAt
                }
            });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * @route   DELETE /staff/:id
 * @desc    Delete a staff member
 * @access  Private (Manager only)
 */
router.delete('/:id', protect, requireRole('manager'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Fix 10: Manager cannot delete themselves
        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'You cannot delete your own account'
            });
        }

        // Ensure user belongs to same restaurant and is not the manager themselves
        if (user.restaurantId.toString() !== req.user.restaurantId.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this user' });
        }

        if (user.role === 'manager') {
            return res.status(400).json({ success: false, message: 'Cannot delete a manager via staff management' });
        }

        await user.deleteOne();
        res.json({ success: true, message: 'User removed' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
