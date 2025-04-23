const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');


dotenv.config();

const requiredEnvVars = ['PG_USER', 'PG_HOST', 'PG_DATABASE', 'PG_PASSWORD', 'PG_PORT'];
requiredEnvVars.forEach((envVar) => {
    if (!process.env[envVar]) {
        console.error(`Error: ${envVar} not set`);
        process.exit(1);
    }
});

// Set up the app
const app = express();
app.use(cors({
  origin: ['https://white-sea-005d2ea03.6.azurestaticapps.net', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json());
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

const port = 3001;

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

// Register route (email + password)
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

// Login route (email + password)
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

const distPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(distPath));
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(path.join(distPath, 'index.html'));
    } else {
        next();
}));

// Start server
app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});
