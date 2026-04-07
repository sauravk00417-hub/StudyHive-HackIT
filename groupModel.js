const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    groupId: { type: String, unique: true, required: true },
    groupName: { type: String, required: true },
    admin: { type: String, required: true },
    members: [{ type: String }]
});

module.exports = mongoose.model('Group', groupSchema);