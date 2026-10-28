require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { sendEmailNotification, TARGET_RECIPIENT } = require('./netlify/functions/notify-email');
const { handleAdminRequest } = require('./netlify/functions/admin');

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

// Notification API endpoints
async function handleNotify(req, res) {
  try {
    const visitorData = req.body || {};
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

// Admin API endpoints (Universal router helper)
async function dispatchAdmin(action, req, res) {
  const result = await handleAdminRequest(action, { ...req.query, ...req.params }, req.headers, req.body);
  if (result.isCsv) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="loveverse_visitors.csv"');
    return res.status(200).send(result.data);
  }
  return res.status(result.status).json(result.data);
}

app.post('/api/admin/login', (req, res) => dispatchAdmin('login', req, res));
app.get('/api/admin/stats', (req, res) => dispatchAdmin('stats', req, res));
app.get('/api/admin/visitors', (req, res) => dispatchAdmin('visitors', req, res));
app.get('/api/admin/visitor/:id', (req, res) => dispatchAdmin('visitor_detail', req, res));
app.get('/api/admin/export-csv', (req, res) => dispatchAdmin('export_csv', req, res));

// Admin Page Route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
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
  console.log(`📊 Private Admin Dashboard active at: http://localhost:${PORT}/admin`);
});
