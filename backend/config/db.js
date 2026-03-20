const mongoose = require('mongoose');

const connectDB = async (retries = 3) => {
    const options = {
        serverSelectionTimeoutMS: 30000,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        family: 4,          // Force IPv4 — avoids IPv6 SRV lookup issues
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const conn = await mongoose.connect(process.env.MONGO_URI, options);
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
                console.warn ('⚠️  Server will run without DB – API calls will fail until DB is reachable');
                // Don't exit — let the Express server start (useful for local dev)
            }
        }
    }
};

module.exports = connectDB;
