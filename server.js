const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
require('dotenv').config();
const session = require('express-session');
const cookieParser = require('cookie-parser');

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
app.use(express.json());

app.use(cookieParser());
app.use(session({
    secret: process.env.COOKIE_SECRET, // 🔐 change this to something strong and secure
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 1 day
        secure: false, // set to true if using HTTPS
        httpOnly: true,
    }
}));

// ✅ Updated CORS Configuration
app.use(cors({
    origin: '*'
}));


const JWT_SECRET = process.env.JWT_SECRET;

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017')
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));


// Cloudinary Configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});


// Define all schemas
const accountSchema = new mongoose.Schema({
    username: String,
    password: String,
    role: String,
    domain: String,
}, { collection: 'accounts' });

const taskSchema = new mongoose.Schema({
    domain: String,
    description: String,
    deadline: String,
    createdAt: { type: Date, default: Date.now }
});

const submissionSchema = new mongoose.Schema({
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },  // Link to Task
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },  // Link to User
    fileUrl: { type: String, required: true },
    status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
    submittedAt: { type: Date, default: Date.now }  // Submission date
});


const contactSchema = new mongoose.Schema({
    name: String,
    email: String,
    message: String,
    createdAt: { type: Date, default: Date.now }
});
const Contact = mongoose.model('Contact', contactSchema);

// Create models using mongoose.models or create new ones
const Account = mongoose.models.Account || mongoose.model('Account', accountSchema);
const Task = mongoose.models.Task || mongoose.model('Task', taskSchema);
const Submission = mongoose.models.Submission || mongoose.model('Submission', submissionSchema);

// Cloudinary storage configuration
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'task-submissions',
        allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'],
        transformation: [{ width: 1000, height: 1000, crop: "limit" }]
    }
});

const upload = multer({ storage: storage });

// Auth Middleware
const authMiddleware = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: "Access Denied" });

    try {
        const verified = jwt.verify(token.replace('Bearer ', ''), JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ error: "Invalid Token" });
    }
};

//contact page

app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body;
        if (!name || !email || !message) {
            return res.status(400).json({ error: "All fields are required." });
        }

        const contactEntry = new Contact({ name, email, message });
        await contactEntry.save();

        res.json({ message: "Query submitted successfully!" });
    } catch (error) {
        console.error("❌ Contact submission error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Routes

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    console.log("🔹 Login Attempt:", username);

    try {
        const user = await Account.findOne({ username }).lean();
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        const token = jwt.sign(
            { id: user._id, role: user.role, domain: user.domain },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({ token, role: user.role });
    } catch (error) {
        console.error(" Login Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
//create task
app.post('/api/admin/createTask', authMiddleware, async (req, res) => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "❌ Access Denied" });

    try {
        const { domain, description, deadline } = req.body;
        if (!domain || !description || !deadline) {
            return res.status(400).json({ error: "⚠️ All fields are required" });
        }

        const newTask = new Task({ domain, description, deadline });
        await newTask.save();
        res.json({ message: "✅ Task Created Successfully" });
    } catch (error) {
        console.error("🔥 Error Creating Task:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
//user task details fetch the task details from the admin.
app.get("/api/user/tasks", authMiddleware, async (req, res) => {
    try {
        const tasks = await Task.find({ domain: req.user.domain });
        const userSubmissions = await Submission.find({
            userId: req.user.id,
            status: { $in: ['Pending', 'Approved'] }
        });

        const submittedTaskIds = userSubmissions.map(sub => sub.taskId.toString());
        const availableTasks = tasks.filter(task =>
            !submittedTaskIds.includes(task._id.toString())
        );

        res.json(availableTasks);
    } catch (error) {
        console.error("🔥 Fetch Tasks Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post('/api/user/submitTask', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        const { taskId } = req.body;
        let fileUrl = req.body.fileUrl;

        if (req.file) {
            fileUrl = req.file.path;
        }

        // Check if a submission exists that is not "Rejected"
        const existingSubmission = await Submission.findOne({
            taskId,
            userId: req.user.id,
            status: { $ne: "Rejected" }  // Only allow resubmission if previous is "Rejected"
        });

        if (existingSubmission) {
            // Delete uploaded file if submission exists
            if (req.file) {
                await cloudinary.uploader.destroy(req.file.filename);
            }
            return res.status(400).json({
                error: "You already have a pending or approved submission for this task"
            });
        }

        // Create new submission
        const submission = new Submission({
            taskId,
            userId: req.user.id,
            fileUrl
        });

        await submission.save();

        res.json({
            message: "Task Submitted Successfully",
            submissionId: submission._id,
            fileUrl,
            submittedAt: submission.submittedAt // Auto-generated
        });

    } catch (error) {
        // Ensure uploaded file is deleted if an error occurs
        if (req.file) {
            await cloudinary.uploader.destroy(req.file.filename);
        }
        console.error("🔥 Submission Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


app.get('/api/user/submissions', authMiddleware, async (req, res) => {
    try {
        const submissions = await Submission.find({ userId: req.user.id })
            .populate('taskId', 'description')
            .sort({ createdAt: -1 })
            .exec();

        res.json(submissions);
    } catch (error) {
        console.error("Error fetching submissions:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/api/admin/submissions', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Access Denied" });
    }

    try {
        const submissions = await Submission.find()
            .populate('userId', 'username')  // Fetch user details
            .populate('taskId', 'description deadline')  // Fetch task description & deadline
            .sort({ submittedAt: -1 });  // Sort by latest submission

        res.json(submissions);
    } catch (error) {
        console.error("🔥 Error fetching submissions:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


app.get('/api/admin/submission/:id', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Access Denied" });
    }

    try {
        const submission = await Submission.findById(req.params.id)
            .populate('userId', 'username')
            .populate('taskId', 'description');

        if (!submission) {
            return res.status(404).json({ error: "Submission not found" });
        }

        res.json(submission);
    } catch (error) {
        console.error("Error fetching specific submission:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post('/api/admin/reviewSubmission', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Access Denied" });
    }

    const { submissionId, status } = req.body;
    await Submission.findByIdAndUpdate(submissionId, { status });
    res.json({ message: `Submission ${status}` });
});


// Create User Functionality
app.post('/api/admin/addUser', authMiddleware, async (req, res) => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "❌ Access Denied" });

    const { username, password, role, domain } = req.body;

    if (!username || !password || !role || !domain) {
        return res.status(400).json({ error: "⚠️ All fields are required" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new Account({ username, password: hashedPassword, role, domain });
        await newUser.save();
        res.json({ message: "✅ User Created Successfully" });
    } catch (error) {
        console.error("🔥 Error Creating User:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
