/**
 * LoveVerse Email Visitor & Love Response Notification Client
 * Dispatches notification emails to owner's Gmail whenever:
 * 1. A visitor opens the website.
 * 2. A visitor clicks YES ❤️.
 * 3. A visitor clicks NO 💔.
 *
 * Strictly adheres to privacy: does not collect or attempt to obtain the visitor's Instagram username.
 */

(function () {
  'use strict';

  // 1. Generate or retrieve First-Party Visitor ID (Format: VIS-82F7A91C)
  function getVisitorId() {
    let vid = localStorage.getItem('lv_visitor_id');
    if (!vid) {
      const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
      vid = 'VIS-' + hex;
      localStorage.setItem('lv_visitor_id', vid);
    }
    return vid;
  }

  // 2. Generate or retrieve Session ID
  function getSessionId() {
    let sid = sessionStorage.getItem('lv_session_id');
    if (!sid) {
      const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
      sid = 'SES-' + hex;
      sessionStorage.setItem('lv_session_id', sid);
    }
    return sid;
  }

  // 3. Format Current Date & Time (e.g., "28 Oct 2026, 6:20 PM")
  function getFormattedTime() {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
      }).format(new Date());
    } catch (e) {
      return new Date().toLocaleString();
    }
  }

  // 4. Detect Traffic Source Channel (Instagram vs Direct/Unknown - never collects personal usernames)
  function detectSource() {
    const urlParams = new URLSearchParams(window.location.search);
    const utmSource = urlParams.get('utm_source');
    const ref = (document.referrer || '').toLowerCase();
    const ua = (navigator.userAgent || '').toLowerCase();

    // Check UTM parameter
    if (utmSource) {
      const s = utmSource.toLowerCase();
      if (s.includes('instagram') || s === 'ig') return 'Instagram';
      if (s.includes('facebook') || s === 'fb') return 'Facebook';
      if (s.includes('google')) return 'Google';
      return utmSource;
    }

    // Check Referrer
    if (ref.includes('instagram.com') || ref.includes('l.instagram.com')) return 'Instagram';
    if (ref.includes('facebook.com') || ref.includes('l.facebook.com')) return 'Facebook';
    if (ref.includes('google.com') || ref.includes('google.')) return 'Google';

    // Check In-App Browser user agent
    if (ua.includes('instagram')) return 'Instagram';

    return 'Direct / Unknown';
  }

  // 5. Detect Device, Browser & Operating System
  function detectClient() {
    const ua = navigator.userAgent || '';
    const width = window.screen.width;

    // Device
    let device = 'Desktop';
    if (/tablet|ipad|playbook|silk/i.test(ua) || (width >= 768 && width <= 1024)) {
      device = 'Tablet';
    } else if (/mobile|iphone|ipod|android|blackberry|iemobile|kindle/i.test(ua) || width < 768) {
      device = /iphone/i.test(ua) ? 'iPhone' : (/android/i.test(ua) ? 'Android' : 'Mobile');
    }

    // Operating System
    let os = 'Unknown OS';
    if (/windows/i.test(ua)) os = 'Windows';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
    else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
    else if (/linux/i.test(ua)) os = 'Linux';

    // Browser
    let browser = 'Unknown Browser';
    if (/instagram/i.test(ua)) browser = 'Instagram In-App Browser';
    else if (/edg/i.test(ua)) browser = 'Edge';
    else if (/chrome|crios/i.test(ua) && !/opr|opera/i.test(ua)) browser = 'Chrome';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
    else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
    else if (/opera|opr/i.test(ua)) browser = 'Opera';

    return { device, os, browser };
  }

  // Helper to post payload to backend email notification route
  function postToBackend(payload) {
    try {
      fetch('/api/notify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function () {
        fetch('/.netlify/functions/notify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(function () {});
      });
    } catch (e) {}
  }

  // 6. Handle "Will you love me?" YES / NO response clicks
  let lastResponseTime = 0;
  let lastResponseAnswer = '';

  window.sendLoveResponse = function (answerType) {
    const now = Date.now();
    // Debounce duplicate clicks within 4 seconds for the same answer
    if (answerType === lastResponseAnswer && now - lastResponseTime < 4000) {
      return;
    }
    lastResponseTime = now;
    lastResponseAnswer = answerType;

    const isYes = answerType.toLowerCase() === 'yes';
    const client = detectClient();

    const payload = {
      event_type: isYes ? 'love_response_yes' : 'love_response_no',
      answer: isYes ? 'YES ❤️' : 'NO 💔',
      visitor_id: getVisitorId(),
      session_id: getSessionId(),
      time: getFormattedTime(),
      source: detectSource(),
      device: client.device,
      browser: client.browser,
      os: client.os,
      page: 'LoveVerse'
    };

    postToBackend(payload);
  };

  // 7. Initial New Visitor Session Notification (Duplicate protected per session)
  const SESSION_KEY = 'lv_email_session_notified';
  if (!sessionStorage.getItem(SESSION_KEY)) {
    sessionStorage.setItem(SESSION_KEY, 'true');

    const client = detectClient();
    const visitPayload = {
      event_type: 'new_visitor',
      visitor_id: getVisitorId(),
      session_id: getSessionId(),
      source: detectSource(),
      time: getFormattedTime(),
      device: client.device,
      browser: client.browser,
      os: client.os,
      page: 'LoveVerse Home'
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        postToBackend(visitPayload);
      });
    } else {
      postToBackend(visitPayload);
    }
  }
})();
