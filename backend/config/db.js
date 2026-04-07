const mongoose = require('mongoose');

// Fail fast when DB is unavailable instead of buffering model calls.
mongoose.set('bufferCommands', true);
mongoose.set('bufferTimeoutMS', 10000);

const connectDB = async (retries = 3) => {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    const options = {
        serverSelectionTimeoutMS: 30000,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        family: 4,          // Force IPv4 — avoids IPv6 SRV lookup issues
    };

    if (!mongoUri) {
        console.error('❌ Missing MongoDB URI. Set MONGO_URI (or MONGODB_URI).');
        const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
        if (isProduction) {
            process.exit(1);
        }
        console.warn('⚠️  Local mode: server will run without DB; API calls will fail until DB URI is provided');
        return;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const conn = await mongoose.connect(mongoUri, options);
            console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
            return;
        } catch (err) {
            console.error(`❌ MongoDB attempt ${attempt}/${retries} failed: ${err.message}`);
            if (attempt < retries) {
                console.log(`🔄 Retrying in 5s...`);
                await new Promise(r => setTimeout(r, 5000));
            } else {
                console.error('💀 All MongoDB connection attempts failed.');
                console.error('   Checklist:');
                console.error('   1. MongoDB Atlas → Network Access → Add 0.0.0.0/0');
                console.error('   2. Verify the cluster is not paused in Atlas');
                console.error('   3. Try from a different network / disable VPN');
                const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
                if (isProduction) {
                    console.error('   4. Render detected: exiting so deployment clearly shows DB failure');
                    process.exit(1);
                }
                console.warn('⚠️  Local mode: server will run without DB; API calls will fail until DB is reachable');
            }
        }
    }
};

module.exports = connectDB;
