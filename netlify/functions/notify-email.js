require('dotenv').config();
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// Fixed fallback recipient specified by user
const FALLBACK_RECIPIENT = 'naveenchinnam982@gmail.com';

// In-memory rate limiting map: ip/visitor_id -> timestamp array
const rateLimitMap = new Map();

// In-memory deduplication map: key -> timestamp (5s window)
const dedupeMap = new Map();

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

function isDuplicate(key, windowMs = 5000) {
  if (!key) return false;
  const now = Date.now();
  const lastTime = dedupeMap.get(key) || 0;
  if (now - lastTime < windowMs) {
    return true;
  }
  dedupeMap.set(key, now);
  // Clean up old entries
  if (dedupeMap.size > 200) {
    for (const [k, v] of dedupeMap.entries()) {
      if (now - v > 60000) dedupeMap.delete(k);
    }
  }
  return false;
}

// Format date & time in Indian Standard Time (IST)
function formatTimeIST(date = new Date()) {
  try {
    const d = new Date(date);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true
    }).format(d) + ' IST';
  } catch (e) {
    return new Date(date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
  }
}

// Extract country / approximate region from Netlify or cloud headers
function extractGeo(geoHeader, clientCountry) {
  if (geoHeader) {
    try {
      const g = typeof geoHeader === 'string' ? JSON.parse(geoHeader) : geoHeader;
      const parts = [];
      if (g.city) parts.push(g.city);
      if (g.subdivision && g.subdivision.name) parts.push(g.subdivision.name);
      if (g.country && g.country.name) parts.push(g.country.name);
      if (parts.length > 0) return parts.join(', ');
    } catch (_) {}
  }
  if (clientCountry && clientCountry !== 'Unknown' && clientCountry.length <= 60) {
    return clientCountry;
  }
  return 'Not available';
}

// Helper to get events file path
function getEventsFilePath() {
  const isServerless = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (isServerless) {
    const tmpDir = path.join('/tmp', 'loveverse');
    if (!fs.existsSync(tmpDir)) {
      try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (_) {}
    }
    return path.join(tmpDir, 'events.json');
  }

  const localDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(localDir)) {
    try { fs.mkdirSync(localDir, { recursive: true }); } catch (_) {}
  }
  return path.join(localDir, 'events.json');
}

// Read events persistently from file storage
function readStoredEvents() {
  try {
    const eventsFile = getEventsFilePath();
    if (fs.existsSync(eventsFile)) {
      const data = fs.readFileSync(eventsFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[Storage Read Error]:', err.message);
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
    // Keep last 1000 events
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

  if (user && pass && pass.trim()) {
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
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_PASS.trim()) {
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

// Helper to escape HTML to prevent injection in emails
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeString(val, maxLen = 120, defaultVal = '') {
  if (val === undefined || val === null) return defaultVal;
  const s = String(val).trim();
  return s.length > maxLen ? s.slice(0, maxLen) : (s || defaultVal);
}

// Core notification function
async function sendEmailNotification(visitorData = {}) {
  const visitorId = safeString(visitorData.visitor_id, 32, 'VIS-UNKNOWN');
  const sessionId = safeString(visitorData.session_id, 32, 'SES-UNKNOWN');
  const source = safeString(visitorData.source, 64, 'Direct / Unknown');
  const time = safeString(visitorData.time, 64, formatTimeIST());
  const device = safeString(visitorData.device, 32, 'Unknown Device');
  const browser = safeString(visitorData.browser, 48, 'Unknown Browser');
  const os = safeString(visitorData.os, 32, 'Unknown OS');
  const page = safeString(visitorData.page, 64, 'LoveVerse');
  const pageUrl = safeString(visitorData.page_url, 255, 'https://loveverse.live/');
  const landingPage = safeString(visitorData.landing_page, 255, '/');
  const eventType = safeString(visitorData.event_type, 32, 'new_visitor');
  const ip = safeString(visitorData.ip, 45, '');
  const screenSize = safeString(visitorData.screen_size, 32, 'Not available');
  const geo = safeString(visitorData.geo, 100, extractGeo(visitorData.geo_raw, visitorData.country));

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

  // Deduplication Check (Suppresses identical rapid triggers within 5s)
  const dedupeKey = `${eventType}:${visitorId}:${sessionId}`;
  if (isDuplicate(dedupeKey, 5000)) {
    console.log(`[Email Notification] Deduplicating rapid repeat trigger for ${dedupeKey}`);
    return { success: true, deduplicated: true, visitor_id: visitorId };
  }

  // Determine Instagram Source Detection status
  const isInstagram = Boolean(
    visitorData.is_instagram ||
    source.toLowerCase().includes('instagram') ||
    browser.toLowerCase().includes('instagram') ||
    (visitorData.referrer && visitorData.referrer.toLowerCase().includes('instagram'))
  );

  const instagramSourceText = isInstagram ? 'Yes (Detected via Referrer / In-App Browser / UTM)' : 'No';
  const instagramUserText = 'Not available (restricted by browser/Instagram security)';

  // UTM parameters check
  const utmSource = safeString(visitorData.utm_source, 100, '');
  const utmMedium = safeString(visitorData.utm_medium, 100, '');
  const utmCampaign = safeString(visitorData.utm_campaign, 100, '');
  const utmContent = safeString(visitorData.utm_content, 100, '');
  const utmTerm = safeString(visitorData.utm_term, 100, '');

  const hasUtm = utmSource || utmMedium || utmCampaign || utmContent || utmTerm;
  const utmSummary = hasUtm
    ? `source=${utmSource || 'none'}, medium=${utmMedium || 'none'}, campaign=${utmCampaign || 'none'}`
    : 'None present';

  // Store rich event record persistently
  storeEvent({
    visitor_id: visitorId,
    session_id: sessionId,
    event_type: eventType,
    answer: answer,
    timestamp: new Date().toISOString(),
    ist_time: time,
    source: source,
    is_instagram: isInstagram,
    referrer: safeString(visitorData.referrer, 255, 'Direct / None'),
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
    utm_term: utmTerm,
    device: device,
    browser: browser,
    os: os,
    screen_size: screenSize,
    country_region: geo,
    language: safeString(visitorData.language, 32, 'en'),
    timezone: safeString(visitorData.timezone, 64, 'UTC'),
    page: page,
    page_url: pageUrl,
    landing_page: landingPage,
    visit_count: Number(visitorData.visit_count) || 1,
    is_new_visitor: visitorData.is_new_visitor !== undefined ? Boolean(visitorData.is_new_visitor) : true,
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

  // Recipient is ALWAYS naveenchinnam982@gmail.com
  const recipientEmail = FALLBACK_RECIPIENT;

  // Exact Subject line matching specifications
  let subject = 'LoveVerse — New Website Visitor ❤️';
  let headline = '🔔 New LoveVerse Visitor';
  let badgeColor = '#ff4d6d';

  if (eventType === 'love_response_yes' || (answer && answer.includes('YES'))) {
    subject = 'LoveVerse — YES ❤️ Response';
    headline = '💖 LoveVerse YES ❤️ Response';
    badgeColor = '#e63950';
  } else if (eventType === 'love_response_no' || (answer && answer.includes('NO'))) {
    subject = 'LoveVerse — NO 💔 Response';
    headline = '💔 LoveVerse NO 💔 Response';
    badgeColor = '#c9184a';
  }

  // Build Plain Text Content
  let textContent = '';
  if (eventType === 'love_response_yes') {
    textContent = `💖 LoveVerse Response

Answer: YES ❤️
Visitor ID: ${visitorId}
Time: ${time}
Source: ${source}
Instagram Traffic: ${instagramSourceText}
Instagram Username: ${instagramUserText}
Page URL: ${pageUrl}
Landing Page: ${landingPage}
Device: ${device}
Browser: ${browser}
Operating System: ${os}
Screen: ${screenSize}
Country / Region: ${geo}
UTMs: ${utmSummary}
`;
  } else if (eventType === 'love_response_no') {
    textContent = `💔 LoveVerse Response

Answer: NO 💔
Visitor ID: ${visitorId}
Time: ${time}
Source: ${source}
Instagram Traffic: ${instagramSourceText}
Instagram Username: ${instagramUserText}
Page URL: ${pageUrl}
Landing Page: ${landingPage}
Device: ${device}
Browser: ${browser}
Operating System: ${os}
Screen: ${screenSize}
Country / Region: ${geo}
UTMs: ${utmSummary}
`;
  } else {
    textContent = `🔔 New LoveVerse Visitor

Visitor ID: ${visitorId}
Time: ${time}
Source: ${source}
Instagram Traffic: ${instagramSourceText}
Instagram Username: ${instagramUserText}
Page: ${page}
Page URL: ${pageUrl}
Landing Page: ${landingPage}
Device: ${device}
Browser: ${browser}
Operating System: ${os}
Screen: ${screenSize}
Country / Region: ${geo}
UTMs: ${utmSummary}
`;
  }

  // Format Escaped HTML Template
  const safeVisitorId = escapeHtml(visitorId);
  const safeSource = escapeHtml(source);
  const safeTime = escapeHtml(time);
  const safeDevice = escapeHtml(device);
  const safeBrowser = escapeHtml(browser);
  const safeOs = escapeHtml(os);
  const safeScreen = escapeHtml(screenSize);
  const safeGeo = escapeHtml(geo);
  const safePageUrl = escapeHtml(pageUrl);
  const safeLanding = escapeHtml(landingPage);
  const safeAnswer = escapeHtml(answer);
  const safeHeadline = escapeHtml(headline);
  const safeIgSource = escapeHtml(instagramSourceText);
  const safeIgUser = escapeHtml(instagramUserText);
  const safeUtm = escapeHtml(utmSummary);

  const htmlContent = `
  <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:580px;margin:0 auto;background:#1a0035;color:#fff0f3;border-radius:18px;overflow:hidden;border:1px solid rgba(255,133,161,0.3);box-shadow:0 8px 24px rgba(0,0,0,0.5);">
    <div style="background:linear-gradient(135deg,#c9184a,#7b2d8b);padding:22px;text-align:center;">
      <h1 style="margin:0;font-size:24px;color:#fff;font-family:Georgia,serif;letter-spacing:1px;">💖 LoveVerse</h1>
      <p style="margin:6px 0 0;font-size:16px;color:#ffb3c1;font-weight:700;">${safeHeadline}</p>
    </div>
    
    <div style="padding:24px 22px;">
      ${safeAnswer ? `
      <div style="text-align:center;margin-bottom:20px;background:rgba(255,255,255,0.06);border:2px solid ${badgeColor};border-radius:14px;padding:16px;">
        <div style="font-size:12px;color:#f8c630;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Selected Answer:</div>
        <div style="font-size:26px;font-weight:900;color:#fff;">${safeAnswer}</div>
      </div>
      ` : ''}

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Event Type:</td>
          <td style="padding:10px 0;font-weight:700;color:#ff85a1;text-align:right;">${escapeHtml(eventType === 'new_visitor' ? 'New Visitor' : (safeAnswer || eventType))}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Visitor ID:</td>
          <td style="padding:10px 0;font-weight:700;color:#ff85a1;text-align:right;"><code style="background:rgba(255,77,109,0.15);padding:2px 8px;border-radius:6px;">${safeVisitorId}</code></td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Visit Date & Time (IST):</td>
          <td style="padding:10px 0;text-align:right;color:#fff0f3;font-weight:600;">${safeTime}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Referral Source:</td>
          <td style="padding:10px 0;font-weight:700;color:#f8c630;text-align:right;">${safeSource}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Instagram Traffic:</td>
          <td style="padding:10px 0;text-align:right;color:#ff85a1;">${safeIgSource}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Instagram Username:</td>
          <td style="padding:10px 0;text-align:right;color:#c9899f;font-style:italic;font-size:13px;">${safeIgUser}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Page URL:</td>
          <td style="padding:10px 0;text-align:right;color:#fff0f3;word-break:break-all;font-size:13px;">${safePageUrl}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Landing Page:</td>
          <td style="padding:10px 0;text-align:right;color:#fff0f3;font-size:13px;">${safeLanding}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Device:</td>
          <td style="padding:10px 0;text-align:right;color:#fff0f3;">${safeDevice}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Browser:</td>
          <td style="padding:10px 0;text-align:right;color:#fff0f3;">${safeBrowser}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Operating System:</td>
          <td style="padding:10px 0;text-align:right;color:#fff0f3;">${safeOs}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Screen Size:</td>
          <td style="padding:10px 0;text-align:right;color:#fff0f3;">${safeScreen}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,133,161,0.15);">
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">Country / Region:</td>
          <td style="padding:10px 0;text-align:right;color:#fff0f3;">${safeGeo}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#c9899f;font-weight:600;">UTM Parameters:</td>
          <td style="padding:10px 0;text-align:right;color:#f8c630;font-size:12px;">${safeUtm}</td>
        </tr>
      </table>
    </div>

    <div style="background:rgba(255,255,255,0.03);padding:12px;text-align:center;font-size:12px;color:#c9899f;border-top:1px solid rgba(255,133,161,0.15);">
      LoveVerse Automatic Notification · Sent to ${escapeHtml(recipientEmail)}
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
      subject: subject,
      preview: textContent,
      notice: 'Configure SMTP_USER and SMTP_PASS in environment variables or Netlify dashboard to deliver live emails.'
    };
  }

  try {
    const fromAddress = `"LoveVerse 💖" <${(process.env.SMTP_USER || recipientEmail).trim()}>`;
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
      subject: subject
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

    // Extract IP and Geo from Netlify cloud headers
    visitorData.ip = event.headers['client-ip'] || event.headers['x-forwarded-for'] || '';
    visitorData.geo_raw = event.headers['x-nf-geo'] || '';
    visitorData.country = event.headers['x-country'] || event.headers['cf-ipcountry'] || '';

    const result = await sendEmailNotification(visitorData);

    // Always return 200 so an email notification failure never breaks the website UI
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
exports.formatTimeIST = formatTimeIST;
exports.FALLBACK_RECIPIENT = FALLBACK_RECIPIENT;
exports.TARGET_RECIPIENT = FALLBACK_RECIPIENT;
