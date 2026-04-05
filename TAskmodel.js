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
    resourceUrl: { type: String, default: '' } 
});module.exports = mongoose.model('Task', taskSchema);