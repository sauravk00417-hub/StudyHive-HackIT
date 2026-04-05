const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const Task = require('./TAskmodel'); 
const Message = require('./MessageModel');
// --- NEW SOCKET.IO IMPORTS ---
const http = require('http');
const { Server } = require('socket.io');

const app = express();

// --- UPGRADE APP TO HTTP SERVER FOR SOCKETS ---
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Successfully connected to MongoDB Atlas!'))
    .catch(err => console.error('Connection error', err));

// --- NEW: LISTEN FOR LIVE CONNECTIONS ---
io.on('connection', async (socket) => {
    console.log('Someone joined the workspace!');

    // Send existing messages to the new user
    const messages = await Message.find().sort({ timestamp: 1 }).limit(50);
    socket.emit('loadChat', messages);

    // Handle new chat messages
    socket.on('sendMessage', async (data) => {
        const newMessage = new Message(data);
        await newMessage.save();
        io.emit('receiveMessage', data); // Send to everyone
    });
});

// --- API ROUTES ---
app.get('/api/tasks', async (req, res) => {
    try {
        const tasks = await Task.find();
        res.status(200).json(tasks);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

app.post('/api/tasks', async (req, res) => {
    try {
        const newTask = new Task({ 
            title: req.body.title,
            isUrgent: req.body.isUrgent,
            isImportant: req.body.isImportant,
            taskSize: req.body.taskSize,
            createdBy: req.body.createdBy,
            creatorPic: req.body.creatorPic,
            dueDate: req.body.dueDate,
            assignedTo: req.body.assignedTo,
            // 👇 ADD THIS LINE ONLY 👇
            resourceUrl: req.body.resourceUrl
        });
        const savedTask = await newTask.save();
        
        io.emit('taskUpdated'); 
        res.status(201).json(savedTask);
    } catch (err) {
        res.status(500).json({ error: 'Failed to save task' });
    }
});
// NEW: Route to toggle "Mark as Done"
app.put('/api/tasks/:id', async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        task.isCompleted = !task.isCompleted; // Flips true to false, or false to true
        await task.save();
        
        io.emit('taskUpdated'); // Tell everyone's screen to update!
        res.status(200).json(task);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update task' });
    }
});
// NEW: Route to rename a task
app.patch('/api/tasks/:id/rename', async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (req.body.title) {
            task.title = req.body.title;
            await task.save();
            io.emit('taskUpdated'); // Notify all teammates instantly
            res.status(200).json(task);
        } else {
            res.status(400).json({ error: 'Title is required' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to rename task' });
    }
});
app.delete('/api/tasks/:id', async (req, res) => {
    try {
        await Task.findByIdAndDelete(req.params.id);
        
        // NEW: Tell everyone's browser to refresh the list!
        io.emit('taskUpdated'); 
        
        res.status(200).json({ message: 'Task successfully deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

const PORT = process.env.PORT || 5000;

// IMPORTANT: We now listen using 'server' instead of 'app'
server.listen(PORT, () => {
    console.log(`Server successfully started on port ${PORT}`);
});