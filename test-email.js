/**
 * Comprehensive Verification Test for LoveVerse Gmail SMTP Notification System
 * Tests:
 * 1. Email subject: "LoveVerse Visitor Notification"
 * 2. Visitor notification payload & exact text format:
 *    🔔 New LoveVerse Visitor
 *    Visitor ID, Time, Source, Device, Browser, Operating System, Page
 * 3. YES ❤️ response payload & exact text format:
 *    💖 LoveVerse Response
 *    Answer: YES ❤️, Visitor ID, Time, Source, Device, Browser
 * 4. NO 💔 response payload & exact text format:
 *    💔 LoveVerse Response
 *    Answer: NO 💔, Visitor ID, Time, Source, Device, Browser
 * 5. Gmail SMTP transporter configuration (service: 'gmail', space-stripping)
 * 6. Rate limiting & anti-spam protection (5/min per visitor)
 * 7. Live HTTP API endpoint /api/notify-email
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const { sendEmailNotification, getTransporter } = require('./netlify/functions/notify-email');

async function runTests() {
  console.log('=================================================================');
  console.log('💖 Testing LoveVerse Gmail SMTP Notification System');
  console.log('=================================================================\n');

  // Test 1: New Visitor Event
  console.log('--- Test 1: New Visitor Notification Format ---');
  const visitorPayload = {
    event_type: 'new_visitor',
    visitor_id: 'VIS-TEST001',
    session_id: 'SES-TEST001',
    source: 'Instagram',
    device: 'Mobile',
    browser: 'Instagram In-App Browser',
    os: 'iOS',
    page: 'LoveVerse Home'
  };

  const resVisitor = await sendEmailNotification(visitorPayload);
  assert.strictEqual(resVisitor.subject, 'LoveVerse Visitor Notification', 'Subject must be exact');
  assert(resVisitor.preview.includes('🔔 New LoveVerse Visitor'), 'Must contain visitor header');
  assert(resVisitor.preview.includes('Visitor ID: VIS-TEST001'), 'Must contain Visitor ID');
  assert(resVisitor.preview.includes('Source: Instagram'), 'Must contain Source');
  assert(resVisitor.preview.includes('Device: Mobile'), 'Must contain Device');
  assert(resVisitor.preview.includes('Browser: Instagram In-App Browser'), 'Must contain Browser');
  assert(resVisitor.preview.includes('Operating System: iOS'), 'Must contain Operating System');
  assert(resVisitor.preview.includes('Page: LoveVerse Home'), 'Must contain Page');
  console.log('Generated Preview:\n' + resVisitor.preview);
  console.log('✅ New visitor notification verified successfully.');

  // Test 2: Love Response - YES ❤️
  console.log('\n--- Test 2: YES ❤️ Response Notification Format ---');
  const yesPayload = {
    event_type: 'love_response_yes',
    answer: 'YES ❤️',
    visitor_id: 'VIS-TEST002',
    session_id: 'SES-TEST002',
    source: 'Instagram',
    device: 'Android',
    browser: 'Chrome',
    os: 'Android',
    page: 'LoveVerse'
  };

  const resYes = await sendEmailNotification(yesPayload);
  assert.strictEqual(resYes.subject, 'LoveVerse Visitor Notification');
  assert(resYes.preview.includes('💖 LoveVerse Response'), 'Must contain YES header');
  assert(resYes.preview.includes('Answer: YES ❤️'), 'Must contain Answer: YES ❤️');
  assert(resYes.preview.includes('Visitor ID: VIS-TEST002'), 'Must contain Visitor ID');
  assert(resYes.preview.includes('Source: Instagram'), 'Must contain Source');
  assert(resYes.preview.includes('Device: Android'), 'Must contain Device');
  assert(resYes.preview.includes('Browser: Chrome'), 'Must contain Browser');
  console.log('Generated Preview:\n' + resYes.preview);
  console.log('✅ YES ❤️ response notification verified successfully.');

  // Test 3: Love Response - NO 💔
  console.log('\n--- Test 3: NO 💔 Response Notification Format ---');
  const noPayload = {
    event_type: 'love_response_no',
    answer: 'NO 💔',
    visitor_id: 'VIS-TEST003',
    session_id: 'SES-TEST003',
    source: 'Direct / Unknown',
    device: 'Desktop',
    browser: 'Firefox',
    os: 'Windows',
    page: 'LoveVerse'
  };

  const resNo = await sendEmailNotification(noPayload);
  assert.strictEqual(resNo.subject, 'LoveVerse Visitor Notification');
  assert(resNo.preview.includes('💔 LoveVerse Response'), 'Must contain NO header');
  assert(resNo.preview.includes('Answer: NO 💔'), 'Must contain Answer: NO 💔');
  assert(resNo.preview.includes('Visitor ID: VIS-TEST003'), 'Must contain Visitor ID');
  assert(resNo.preview.includes('Source: Direct / Unknown'), 'Must contain Source');
  assert(resNo.preview.includes('Device: Desktop'), 'Must contain Device');
  assert(resNo.preview.includes('Browser: Firefox'), 'Must contain Browser');
  console.log('Generated Preview:\n' + resNo.preview);
  console.log('✅ NO 💔 response notification verified successfully.');

  // Test 4: Gmail SMTP Transporter Construction
  console.log('\n--- Test 4: Gmail SMTP Transporter Setup & Password Space-Stripping ---');
  const prevUser = process.env.SMTP_USER;
  const prevPass = process.env.SMTP_PASS;
  process.env.SMTP_USER = 'testuser@gmail.com';
  process.env.SMTP_PASS = 'abcd efgh ijkl mnop'; // 16-char app password with spaces
  const transporter = getTransporter();
  assert(transporter !== null, 'Transporter must be created');
  assert.strictEqual(transporter.options.service, 'gmail', 'Must use gmail service');
  assert.strictEqual(transporter.options.auth.pass, 'abcdefghijklmnop', 'Must strip spaces from app password');
  console.log('✅ Gmail SMTP transporter options verified successfully.');
  // Restore environment variables
  process.env.SMTP_USER = prevUser;
  if (prevPass) process.env.SMTP_PASS = prevPass;
  else delete process.env.SMTP_PASS;

  // Test 5: Rate Limiting & Anti-Spam
  console.log('\n--- Test 5: Rate Limiting & Anti-Spam Protection ---');
  const spamVisitorId = 'VIS-SPAMMER-100';
  let blocked = false;
  for (let i = 0; i < 7; i++) {
    const res = await sendEmailNotification({
      event_type: 'love_response_yes',
      visitor_id: spamVisitorId,
      source: 'Direct / Unknown'
    });
    if (res.reason === 'rate_limited') {
      blocked = true;
      console.log(`✅ Rate limiter successfully blocked spam attempt #${i + 1} for ${spamVisitorId}`);
      break;
    }
  }
  assert.strictEqual(blocked, true, 'Rate limiter must block after 5 requests/min per visitor');

  // Test 6: Live HTTP Endpoint (/api/notify-email)
  console.log('\n--- Test 6: Live HTTP Endpoint (/api/notify-email) ---');
  const app = express();
  app.use(express.json());
  app.post('/api/notify-email', async (req, res) => {
    const result = await sendEmailNotification(req.body);
    res.json(result);
  });

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const endpointRes = await fetch(`http://localhost:${port}/api/notify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_type: 'new_visitor',
      visitor_id: 'VIS-HTTP-TEST',
      source: 'Instagram',
      device: 'Android',
      browser: 'Chrome',
      os: 'Android',
      page: 'LoveVerse'
    })
  });

  const endpointData = await endpointRes.json();
  assert.strictEqual(endpointData.subject, 'LoveVerse Visitor Notification');
  server.close();
  console.log('✅ Live HTTP endpoint /api/notify-email verified successfully.');

  console.log('\n=================================================================');
  console.log('🎉 ALL GMAIL SMTP NOTIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('=================================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
