const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

dotenv.config();

const PORT = process.env.PORT || 3001;

const requiredEnvVars = ['PG_USER', 'PG_HOST', 'PG_DATABASE', 'PG_PASSWORD', 'PG_PORT'];
requiredEnvVars.forEach((envVar) => {
    if (!process.env[envVar]) {
        console.error(`Error: ${envVar} not set`);
        process.exit(1);
    }
});

const app = express();
app.use(cors({
    origin: ['https://white-sea-005d2ea03.6.azurestaticapps.net', 'http://localhost:3000','http://localhost:5173','https://red-ocean-086fc7003.6.azurestaticapps.net'],
    credentials: true
}));
app.use(express.json());
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

const pool = new Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT || 5432,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect()
    .then(() => console.log('✅ Connected to PostgreSQL'))
    .catch((err) => {
        console.error('❌ Database connection error:', err.stack);
        process.exit(1);
    });

app.get('/dog-facts', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM dog_facts');
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No dog facts found' });
        }
        res.json({ facts: result.rows });
    } catch (error) {
        console.error('Dog facts error:', error);
        res.status(500).json({ error: 'Failed to fetch dog facts' });
    }
});

app.post('/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
            [email, hashedPassword]
        );
        res.status(201).json({ message: 'User registered', user: result.rows[0] });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        res.status(200).json({ message: 'Login successful', user: { id: user.id, email: user.email } });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/api/health', (req, res) => {
    res.status(200).send('OK');
});

// Get all posts
app.get('/api/posts', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT posts.*, users.email as author_email 
            FROM posts 
            JOIN users ON posts.user_id = users.id 
            ORDER BY created_at DESC
        `);
        res.json({ posts: result.rows });
    } catch (error) {
        console.error('Failed to get posts:', error);
        res.status(500).json({ error: 'Failed to get posts' });
    }
});

// Create new post
app.post('/api/posts', async (req, res) => {
    const { title, content, userId } = req.body;
    if (!title || !content || !userId) {
        return res.status(400).json({ error: 'Title, content and user ID are required' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO posts (title, content, user_id) VALUES ($1, $2, $3) RETURNING id',
            [title, content, userId]
        );
        const newPost = await pool.query(
            'SELECT posts.*, users.email as author_email FROM posts JOIN users ON posts.user_id = users.id WHERE posts.id = $1',
            [result.rows[0].id]
        );
        res.status(201).json({ message: 'Post created successfully', post: newPost.rows[0] });
    } catch (error) {
        console.error('Failed to create post:', error);
        res.status(500).json({ error: 'Failed to create post' });
    }
});

// Get single post
app.get('/api/posts/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT posts.*, users.email as author_email FROM posts JOIN users ON posts.user_id = users.id WHERE posts.id = $1',
            [req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        res.json({ post: result.rows[0] });
    } catch (error) {
        console.error('Failed to get post:', error);
        res.status(500).json({ error: 'Failed to get post' });
    }
});

// Update post
app.put('/api/posts/:id', async (req, res) => {
    const { title, content, userId } = req.body;
    try {
        const post = await pool.query('SELECT user_id FROM posts WHERE id = $1', [req.params.id]);
        if (post.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        if (post.rows[0].user_id !== parseInt(userId)) {
            return res.status(403).json({ error: 'Not authorized to modify this post' });
        }
        await pool.query(
            'UPDATE posts SET title = $1, content = $2 WHERE id = $3 AND user_id = $4',
            [title, content, req.params.id, userId]
        );
        const updatedPost = await pool.query(
            'SELECT posts.*, users.email as author_email FROM posts JOIN users ON posts.user_id = users.id WHERE posts.id = $1',
            [req.params.id]
        );
        res.json({ message: 'Post updated successfully', post: updatedPost.rows[0] });
    } catch (error) {
        console.error('Failed to update post:', error);
        res.status(500).json({ error: 'Failed to update post' });
    }
});

// Delete post
app.delete('/api/posts/:id', async (req, res) => {
    const { userId } = req.body;
    try {
        const post = await pool.query('SELECT user_id FROM posts WHERE id = $1', [req.params.id]);
        if (post.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        if (post.rows[0].user_id !== parseInt(userId)) {
            return res.status(403).json({ error: 'Not authorized to delete this post' });
        }
        await pool.query('DELETE FROM posts WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
        res.json({ message: 'Post deleted successfully' });
    } catch (error) {
        console.error('Failed to delete post:', error);
        res.status(500).json({ error: 'Failed to delete post' });
    }
});

const distPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(distPath));

app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(path.join(distPath, 'index.html'));
    } else {
        next();
    }
});

app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

app.get('/', (req, res) => {
    res.send('🐶 Dogs API is running!');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

