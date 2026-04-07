const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    isCompleted: { type: Boolean, default: false },
    isUrgent: { type: Boolean, default: false },
    isImportant: { type: Boolean, default: false },
    taskSize: { type: String, enum: ['Big Rock', 'Pebble', 'Sand'], default: 'Pebble' },
    createdBy: { type: String, default: 'Anonymous' },
    dueDate: { type: String, default: '' },
    assignedTo: { type: String, default: 'Unassigned' }, 
    creatorPic: { type: String, default: '' },
    resourceUrl: { type: String, default: '' },
    completedBy: { type: String, default: null },
    completedAt: { type: Date, default: null },
    proofText: { type: String, default: '' },
    proofFile: { type: String, default: '' },
    proofSubmitted: { type: Boolean, default: false },
    // 'none' = new task or no proof yet; 'pending' only after assignee submits proof
    proofStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    approvedBy: { type: String, default: '' },
    approvedAt: { type: Date, default: null },
    ownerId: { type: String, required: true },
    groupId: { type: String, default: null }
});module.exports = mongoose.model('Task', taskSchema);