require('dotenv').config();
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// STRICTLY ENFORCED RECIPIENT - All application notifications sent to user's Gmail
const FALLBACK_RECIPIENT = 'naveenchinnam982@gmail.com';

// Security helper: Escape HTML to prevent injection in email clients
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Security helper: Truncate input strings to safe lengths
function safeString(val, maxLength = 120, fallback = '') {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  return trimmed.length > maxLength ? trimmed.substring(0, maxLength) : trimmed;
}

// Rate limiting cache (in-memory sliding window: max 5 notifications per minute per visitor)
const rateLimitMap = new Map();

function isRateLimited(key, maxLimit = 5, windowMs = 60000) {
  if (!key) return false;
  const now = Date.now();
  const timestamps = (rateLimitMap.get(key) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxLimit) {
    return true;
  }
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return false;
}

// Helper to format date & time (e.g., "28 Oct 2026, 6:20 PM")
function formatTime(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(new Date(date));
  } catch (e) {
    return new Date(date).toLocaleString();
  }
}

// Helper to get events file path
function getEventsFilePath() {
  const isServerless = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const dataDir = isServerless ? '/tmp' : path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'events.json');
}

// Read events persistently
function readStoredEvents() {
  try {
    const eventsFile = getEventsFilePath();
    if (fs.existsSync(eventsFile)) {
      const content = fs.readFileSync(eventsFile, 'utf8') || '[]';
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('[Storage Read Error]:', e.message);
  }
  return [];
}

// Store event record persistently
function storeEvent(eventData) {
  try {
    const eventsFile = getEventsFilePath();
    let events = readStoredEvents();
    events.push({
      ...eventData,
      recorded_at: new Date().toISOString()
    });
    // Keep last 1000 events to ensure history is rich
    if (events.length > 1000) {
      events = events.slice(events.length - 1000);
    }
    fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2), 'utf8');
  } catch (err) {
    console.error('[Storage Error]:', err.message);
  }
}

// Create Gmail SMTP Transporter using SMTP_USER and SMTP_PASS
function getTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (user && pass) {
    // Automatically strip any spaces if user pasted 16-char app password like "abcd efgh ijkl mnop"
    const cleanedPass = pass.replace(/\s+/g, '');
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: user.trim(),
        pass: cleanedPass
      }
    });
  }

  // Fallback to custom SMTP host if explicitly defined
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER.trim(),
        pass: process.env.SMTP_PASS.replace(/\s+/g, '')
      }
    });
  }

  return null;
}

// Core notification function
async function sendEmailNotification(visitorData = {}) {
  const visitorId = safeString(visitorData.visitor_id, 32, 'VIS-UNKNOWN');
  const sessionId = safeString(visitorData.session_id, 32, 'SES-UNKNOWN');
  const source = safeString(visitorData.source, 64, 'Direct / Unknown');
  const time = safeString(visitorData.time, 48, formatTime());
  const device = safeString(visitorData.device, 32, 'Unknown');
  const browser = safeString(visitorData.browser, 48, 'Unknown');
  const os = safeString(visitorData.os, 32, 'Unknown');
  const page = safeString(visitorData.page, 64, 'LoveVerse');
  const eventType = safeString(visitorData.event_type, 32, 'new_visitor');
  const ip = safeString(visitorData.ip, 45, '');

  let answer = safeString(visitorData.answer, 32, '');
  if (!answer) {
    if (eventType === 'love_response_yes') answer = 'YES ❤️';
    else if (eventType === 'love_response_no') answer = 'NO 💔';
  }

  // Rate Limiting Check (Max 5/min per visitor)
  if (isRateLimited(`vid:${visitorId}`, 5, 60000)) {
    console.warn(`[Email Notification] Rate limit exceeded for visitor: ${visitorId}`);
    return { success: false, reason: 'rate_limited', visitor_id: visitorId };
  }

  // Store rich event record persistently
  storeEvent({
    visitor_id: visitorId,
    session_id: sessionId,
    event_type: eventType,
    answer: answer,
    timestamp: new Date().toISOString(),
    source: source,
    referrer: safeString(visitorData.referrer, 255, 'Direct'),
    utm_source: safeString(visitorData.utm_source, 100, ''),
    utm_medium: safeString(visitorData.utm_medium, 100, ''),
    utm_campaign: safeString(visitorData.utm_campaign, 100, ''),
    utm_content: safeString(visitorData.utm_content, 100, ''),
    utm_term: safeString(visitorData.utm_term, 100, ''),
    device: device,
    browser: browser,
    os: os,
    screen_size: safeString(visitorData.screen_size, 32, ''),
    language: safeString(visitorData.language, 32, 'en'),
    timezone: safeString(visitorData.timezone, 64, 'UTC'),
    first_visit: safeString(visitorData.first_visit, 32, ''),
    last_visit: safeString(visitorData.last_visit, 32, ''),
    visit_count: Number(visitorData.visit_count) || 1,
    is_new_visitor: visitorData.is_new_visitor !== undefined ? Boolean(visitorData.is_new_visitor) : true,
    page: page,
    ip: ip ? ip.replace(/:\d+$/, '') : undefined
  });

  // Only send notification emails for the 3 specified triggers:
  // 1. new_visitor
  // 2. love_response_yes (YES ❤️)
  // 3. love_response_no (NO 💔)
  const isNotifyEvent = eventType === 'new_visitor' || eventType === 'love_response_yes' || eventType === 'love_response_no';
  if (!isNotifyEvent) {
    return { success: true, stored: true, event_type: eventType };
  }

  // Recipient is ALWAYS naveenchinnam982@gmail.com — the notification inbox
  // SMTP_USER is the FROM/sender account (can differ from recipient)
  const recipientEmail = FALLBACK_RECIPIENT;

  // Exact Subject line: "LoveVerse Visitor Notification"
  const subject = 'LoveVerse Visitor Notification';

  let textContent = '';
  let headline = '';
  let badgeColor = '#ff4d6d';

  if (eventType === 'love_response_yes' || (answer && answer.includes('YES'))) {
    headline = '💖 LoveVerse Response';
    badgeColor = '#e63950';
    textContent = `💖 LoveVerse Response

Answer: YES ❤️
Visitor ID: ${visitorId}
Time: ${time}
Source: ${source}
Device: ${device}
Browser: ${browser}
`;
  } else if (eventType === 'love_response_no' || (answer && answer.includes('NO'))) {
    headline = '💔 LoveVerse Response';
    badgeColor = '#c9184a';
    textContent = `💔 LoveVerse Response

Answer: NO 💔
Visitor ID: ${visitorId}
Time: ${time}
Source: ${source}
Device: ${device}
Browser: ${browser}
`;
  } else {
    headline = '🔔 New LoveVerse Visitor';
    badgeColor = '#ff4d6d';
    textContent = `🔔 New LoveVerse Visitor

Visitor ID: ${visitorId}
Time: ${time}
Source: ${source}
Device: ${device}
Browser: ${browser}
Operating System: ${os}
Page: ${page}
`;
  }

  // Format Escaped HTML Template matching requested LoveVerse design
  const safeVisitorId = escapeHtml(visitorId);
  const safeSource = escapeHtml(source);
  const safeTime = escapeHtml(time);
  const safeDevice = escapeHtml(device);
  const safeBrowser = escapeHtml(browser);
  const safeOs = escapeHtml(os);
  const safePage = escapeHtml(page);
  const safeAnswer = escapeHtml(answer);
  const safeHeadline = escapeHtml(headline);

  const htmlContent = `
  <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:560px;margin:0 auto;background:#1a0035;color:#fff0f3;border-radius:18px;overflow:hidden;border:1px solid rgba(255,133,161,0.3);box-shadow:0 8px 24px rgba(0,0,0,0.5);">
    <div style="background:linear-gradient(135deg,#c9184a,#7b2d8b);padding:22px;text-align:center;">
      <h1 style="margin:0;font-size:22px;color:#fff;font-family:Georgia,serif;letter-spacing:1px;">💖 LoveVerse</h1>
      <p style="margin:6px 0 0;font-size:15px;color:#ffb3c1;font-weight:700;">${safeHeadline}</p>
    </div>
    
    <div style="padding:24px 22px;">
      ${safeAnswer ? `
      <div style="text-align:center;margin-bottom:20px;background:rgba(255,255,255,0.06);border:1.5px solid ${badgeColor};border-radius:14px;padding:14px;">
        <div style="font-size:12px;color:#f8c630;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Answer:</div>
        <div style="font-size:24px;font-weight:900;color:#fff;">${safeAnswer}</div>
      </div>
      ` : ''}

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Visitor ID:</td>
          <td style="padding:10px 0;font-weight:700;color:#ff85a1;text-align:right;"><code style="background:rgba(255,77,109,0.15);padding:2px 8px;border-radius:6px;">${safeVisitorId}</code></td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Time:</td>
          <td style="padding:10px 0;text-align:right;color:#fff0f3;">${safeTime}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Source:</td>
          <td style="padding:10px 0;font-weight:700;color:#f8c630;text-align:right;">${safeSource}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Device:</td>
          <td style="padding:10px 0;text-align:right;color:#fff0f3;">${safeDevice}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Browser:</td>
          <td style="padding:10px 0;text-align:right;color:#fff0f3;">${safeBrowser}</td>
        </tr>
        ${!safeAnswer ? `
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Operating System:</td>
          <td style="padding:10px 0;text-align:right;color:#fff0f3;">${safeOs}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Page:</td>
          <td style="padding:10px 0;text-align:right;color:#fff0f3;">${safePage}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    <div style="background:rgba(255,255,255,0.03);padding:12px;text-align:center;font-size:12px;color:#c9899f;border-top:1px solid rgba(255,133,161,0.15);">
      LoveVerse Notification System · Sent to ${escapeHtml(recipientEmail)}
    </div>
  </div>`;

  console.log(`[Email Notification] Prepared email for: ${recipientEmail}`);
  console.log(`[Email Notification] Subject: ${subject}`);

  const transporter = getTransporter();

  if (!transporter) {
    console.log('[Email Notification] Notice: Gmail SMTP credentials (SMTP_USER & SMTP_PASS) not configured in environment.');
    return {
      success: false,
      reason: 'credentials_missing',
      recipient: recipientEmail,
      subject,
      preview: textContent
    };
  }

  try {
    const fromAddress = `"LoveVerse" <${process.env.SMTP_USER}>`;
    const info = await transporter.sendMail({
      from: fromAddress,
      to: recipientEmail,
      subject: subject,
      text: textContent,
      html: htmlContent
    });

    console.log('[Email Notification] Successfully delivered email via Gmail SMTP! Message ID:', info.messageId);
    return {
      success: true,
      recipient: recipientEmail,
      messageId: info.messageId,
      subject
    };
  } catch (err) {
    console.error('[Email Notification] Delivery failed:', err.message);
    return {
      success: false,
      error: err.message,
      recipient: recipientEmail,
      subject: subject
    };
  }
}

// Netlify Function Handler
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  // Body size limit: reject payloads > 50KB
  if (event.body && event.body.length > 51200) {
    return {
      statusCode: 413,
      headers,
      body: JSON.stringify({ error: 'Payload Too Large' })
    };
  }

  // Content-type check
  const contentType = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
  if (event.body && !contentType.includes('application/json')) {
    return {
      statusCode: 415,
      headers,
      body: JSON.stringify({ error: 'Unsupported Media Type: expected application/json' })
    };
  }

  try {
    const visitorData = JSON.parse(event.body || '{}');
    const result = await sendEmailNotification(visitorData);

    // Always return 200 so a failed email notification doesn't break the website UI
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };
  } catch (err) {
    console.error('[Handler Error]:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Internal Server Error' })
    };
  }
};

exports.sendEmailNotification = sendEmailNotification;
exports.getTransporter = getTransporter;
exports.readStoredEvents = readStoredEvents;
exports.storeEvent = storeEvent;
exports.FALLBACK_RECIPIENT = FALLBACK_RECIPIENT;
exports.TARGET_RECIPIENT = FALLBACK_RECIPIENT;


