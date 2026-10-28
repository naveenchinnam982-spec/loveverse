require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { sendEmailNotification, TARGET_RECIPIENT } = require('./netlify/functions/notify-email');

const app = express();

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// CORS & Body parser with payload limit (prevents DoS)
app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// Serve static assets from project root
app.use(express.static(path.join(__dirname)));

// Notification API endpoint
async function handleNotify(req, res) {
  try {
    const visitorData = req.body || {};
    // Extract real client IP
    visitorData.ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const result = await sendEmailNotification(visitorData);
    res.json(result);
  } catch (err) {
    console.error('[Server Notification Error]:', err.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}

app.post('/api/notify-email', handleNotify);
app.post('/.netlify/functions/notify-email', handleNotify);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'LoveVerse Notification System', target: TARGET_RECIPIENT });
});

// Explicit root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Global 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`💖 LoveVerse Website running at: http://localhost:${PORT}`);
  console.log(`📧 Email Notification Endpoint active (Target: ${TARGET_RECIPIENT})`);
});
