const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({
    path: path.join(__dirname, '..', 'backend', '.env')
});

async function checkUsers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));
        
        const User = mongoose.model('User', new mongoose.Schema({}));
        const count = await User.countDocuments();
        console.log('User count:', count);
        
        const users = await User.find().limit(5);
        console.log('Recent users:', JSON.stringify(users, null, 2));
        
        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err.message);
    }
}

checkUsers();
