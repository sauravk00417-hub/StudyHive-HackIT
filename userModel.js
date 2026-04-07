const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    googleName: { type: String, required: true },
    pic: { type: String, default: '' },
    email: { type: String, unique: true, required: true }
});

module.exports = mongoose.model('User', userSchema);