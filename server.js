const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const Task = require('./taskModel.js');
const Message = require('./MessageModel');
const User = require('./userModel.js');
const Group = require('./groupModel.js');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

// Serve uploaded proof files
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const safeBase = (path.parse(file.originalname).name || 'proof')
            .replace(/[^a-z0-9_-]/gi, '_')
            .slice(0, 60);
        const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 10);
        cb(null, `${safeBase}_${Date.now()}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

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
        const { username } = req.query;
        if (!username) {
            return res.status(400).json({ error: 'Username required' });
        }
        // Get user's groups
        const userGroups = await Group.find({ members: username }).select('groupId');
        const groupIds = userGroups.map(g => g.groupId);
        // Fetch tasks where ownerId === username OR groupId in user's groups
        const tasks = await Task.find({
            $or: [
                { ownerId: username },
                { groupId: { $in: groupIds } }
            ]
        });
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
            resourceUrl: req.body.resourceUrl,
            ownerId: req.body.ownerId,
            groupId: req.body.groupId || null,
            proofSubmitted: false,
            proofStatus: 'none'
        });
        const savedTask = await newTask.save();
        
        io.emit('taskUpdated'); 
        res.status(201).json(savedTask);
    } catch (err) {
        res.status(500).json({ error: 'Failed to save task' });
    }
});

// --- STATELESS: AI Team Pulse Quiz (placeholder) ---
app.post('/api/generate-quiz', async (req, res) => {
    try {
        const titles = req.body;
        if (!Array.isArray(titles) || titles.some(t => typeof t !== 'string')) {
            return res.status(400).json({ error: 'Body must be an array of strings (completed task titles).' });
        }

        // Placeholder "LLM call" simulation.
        // Prompt idea:
        // "Generate a 3-question multiple choice quiz based on these completed study tasks: [titles].
        // Return strictly a JSON array of objects with 'question', 'options' (array of 4 strings),
        // and 'answer' (the correct option)."
        const dummyQuiz = [
            {
                question: `Based on your recent work, which topic appears most represented?`,
                options: [
                    'Reviewing fundamentals and summaries',
                    'Only brainstorming with no deliverables',
                    'No study tasks were completed',
                    'Learning unrelated hobbies'
                ],
                answer: 'Reviewing fundamentals and summaries'
            },
            {
                question: `What is the best next step to keep team momentum after completing tasks like: ${titles.slice(0, 2).join(' • ')}?`,
                options: [
                    'Define a small follow-up task and assign an owner',
                    'Stop tracking tasks completely',
                    'Wait indefinitely for motivation',
                    'Delete all completed tasks'
                ],
                answer: 'Define a small follow-up task and assign an owner'
            },
            {
                question: `Which habit improves proof-based completion quality the most?`,
                options: [
                    'Attach a clear proof document and short summary',
                    'Approve your own proof',
                    'Skip proof and mark everything done',
                    'Use random file names with no context'
                ],
                answer: 'Attach a clear proof document and short summary'
            }
        ];

        res.status(200).json(dummyQuiz);
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate quiz' });
    }
});

// User Registration/Login
app.post('/api/users', async (req, res) => {
    try {
        const { googleName, pic, email } = req.body;
        let user = await User.findOne({ email });
        if (!user) {
            // Auto-generate unique username
            let username;
            let counter = 1;
            do {
                username = `${googleName.replace(/\s+/g, '').toUpperCase()}${counter}`;
                counter++;
            } while (await User.findOne({ username }));
            user = new User({ username, googleName, pic, email });
            await user.save();
        }
        res.status(200).json({ username: user.username, name: user.googleName, pic: user.pic });
    } catch (err) {
        res.status(500).json({ error: 'Failed to register/login user' });
    }
});

// Group Endpoints
app.post('/api/groups', async (req, res) => {
    try {
        const { groupName, admin } = req.body;
        // Generate unique groupId
        let groupId;
        let counter = 1;
        do {
            groupId = `GRP${counter}`;
            counter++;
        } while (await Group.findOne({ groupId }));
        const group = new Group({ groupId, groupName, admin, members: [admin] });
        await group.save();
        res.status(201).json({ groupId, groupName });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create group' });
    }
});

app.get('/api/groups', async (req, res) => {
    try {
        const { username } = req.query;

        if (!username) {
            return res.status(400).json({ error: 'Username required' });
        }

        const groups = await Group.find({
            $or: [
                { admin: username },
                { members: username }
            ]
        });

        res.status(200).json(groups);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

app.put('/api/groups/:groupId/add', async (req, res) => {
    try {
        const { username } = req.body;
        // First, check if the user exists
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const group = await Group.findOne({ groupId: req.params.groupId });
        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }
        if (!group.members.includes(username)) {
            group.members.push(username);
            await group.save();
            io.emit('memberAdded', { groupId: req.params.groupId, username });
        }
        res.status(200).json({ message: 'Member added' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add member' });
    }
});

app.delete('/api/groups/:id', async (req, res) => {
    try {
        const group = await Group.findById(req.params.id.trim());

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        await Group.findByIdAndDelete(req.params.id.trim());

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

app.get('/api/groups/:username', async (req, res) => {
    try {
        const groups = await Group.find({ members: req.params.username });
        res.status(200).json(groups);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// UPGRADED: Route to toggle "Mark as Done" with PROF
app.put('/api/tasks/:id', async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        const userName = req.body.user || "Anonymous"; // Get the name from the request

        task.isCompleted = !task.isCompleted; // Flip status

        // THE PROOF LOGIC
        if (task.isCompleted) {
            task.completedBy = userName; // Stamp the name
            task.completedAt = new Date(); // Stamp the time
        } else {
            task.completedBy = null; // Clear if unchecked
            task.completedAt = null;
        }

        await task.save();
        
        io.emit('taskUpdated'); // Notify all teammates
        res.status(200).json(task);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update task with proof' });
    }
});

app.put('/api/tasks/:id/proof', upload.single('proofFile'), async (req, res) => {
    try {
        const { proofText, completedBy } = req.body;

        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        task.proofText = proofText || '';
        // Store a URL path that can be opened from the browser
        task.proofFile = req.file ? `/uploads/${req.file.filename}` : '';
        task.proofSubmitted = true;
        task.isCompleted = false;
        task.proofStatus = 'pending';
        task.completedBy = completedBy;
        task.completedAt = new Date();

        await task.save();

        io.emit('taskProofSubmitted', task);

        res.status(200).json(task);
    } catch (err) {
        res.status(500).json({ error: 'Failed to submit proof' });
    }
});

app.put('/api/tasks/:id/approve', async (req, res) => {
    try {
        const { approvedBy } = req.body;
        if (!approvedBy || typeof approvedBy !== 'string') {
            return res.status(400).json({ error: 'approvedBy (username) required' });
        }

        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ error: 'Task not found' });
        if (!task.proofSubmitted || task.proofStatus !== 'pending') {
            return res.status(400).json({ error: 'No proof pending approval' });
        }

        const assigneeRaw = (task.assignedTo || '').trim();
        const unassigned = !assigneeRaw || assigneeRaw === 'Unassigned';
        const byNorm = approvedBy.trim().toLowerCase();

        if (!unassigned && assigneeRaw.toLowerCase() === byNorm) {
            return res.status(403).json({ error: 'Assignee cannot approve this task' });
        }
        if (task.completedBy && task.completedBy === approvedBy) {
            return res.status(403).json({ error: 'You cannot approve proof you submitted' });
        }

        let authorized = task.ownerId === approvedBy;
        if (!authorized && task.groupId) {
            const g = await Group.findOne({ groupId: task.groupId });
            if (g && (g.admin === approvedBy || (g.members && g.members.includes(approvedBy)))) {
                authorized = true;
            }
        }
        if (!authorized) {
            return res.status(403).json({ error: 'You are not allowed to approve this task' });
        }

        task.proofStatus = 'approved';
        task.isCompleted = true;
        task.approvedBy = approvedBy;
        task.approvedAt = new Date();

        await task.save();

        io.emit('taskApproved', task);

        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'Approval failed' });
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