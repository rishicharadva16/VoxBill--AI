const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name:         { type: String, required: true, trim: true },
    email:        { type: String, lowercase: true, trim: true, required: false }, // Optional for waiters
    username:     { type: String, trim: true, unique: true, sparse: true }, // Required for waiters
    password:     { type: String, required: true, minlength: 6 },
    role:         { type: String, enum: ['manager', 'waiter'], default: 'waiter' },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' },
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// Compare password helper
userSchema.methods.matchPassword = async function (entered) {
    return bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('User', userSchema);
