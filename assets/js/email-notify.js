/**
 * LoveVerse Visitor Tracking & Gmail Notification Client
 * Handles:
 * 1. Automatic New Visitor session recording & instant Gmail notification
 * 2. "Will you love me?" YES ❤️ and NO 💔 response clicks & Gmail notifications
 * 3. Telemetry: Anonymous Visitor ID, Session ID, Time in IST, Source, Referrer, UTMs, Device, Browser, OS, Screen, Country/Region
 * 
 * Strict Privacy:
 * - Does NOT collect or fabricate visitor's Instagram username, passwords, cookies, or personal data.
 * - Reports "Instagram username: Not available (restricted by browser/Instagram security)".
 */

(function () {
  'use strict';

  // 1. Anonymous Privacy-Conscious Visitor ID (Format: VIS-82F7A91C)
  function getVisitorInfo() {
    let vid = localStorage.getItem('lv_visitor_id');
    const nowIso = new Date().toISOString();
    let isNew = false;
    let firstVisit = localStorage.getItem('lv_first_visit');
    let lastVisit = localStorage.getItem('lv_last_visit');
    let count = parseInt(localStorage.getItem('lv_visit_count') || '0', 10);

    if (!vid) {
      isNew = true;
      const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
      vid = 'VIS-' + hex;
      firstVisit = nowIso;
      lastVisit = nowIso;
      count = 1;
      localStorage.setItem('lv_visitor_id', vid);
      localStorage.setItem('lv_first_visit', firstVisit);
      localStorage.setItem('lv_last_visit', lastVisit);
      localStorage.setItem('lv_visit_count', '1');
    } else {
      // Increment session visit count if new browser session
      if (!sessionStorage.getItem('lv_session_id')) {
        count += 1;
        lastVisit = nowIso;
        localStorage.setItem('lv_visit_count', String(count));
        localStorage.setItem('lv_last_visit', lastVisit);
      }
    }

    return { vid, isNew, firstVisit, lastVisit, count };
  }

  // 2. Anonymous Session ID (Format: SES-XXXXXXXX)
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

  // 3. Formatted Date & Time in IST
  function getFormattedTimeIST() {
    try {
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: true
      }).format(new Date()) + ' IST';
    } catch (e) {
      return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
    }
  }

  // 4. Extract Traffic Source & UTM Parameters
  function getSourceData() {
    const urlParams = new URLSearchParams(window.location.search);
    const utmSource = urlParams.get('utm_source');
    const utmMedium = urlParams.get('utm_medium');
    const utmCampaign = urlParams.get('utm_campaign');
    const utmContent = urlParams.get('utm_content');
    const utmTerm = urlParams.get('utm_term');
    const ref = (document.referrer || '').toLowerCase();
    const ua = (navigator.userAgent || '').toLowerCase();

    let source = 'Direct / Unknown';
    let isInstagramTraffic = false;

    if (utmSource) {
      const s = utmSource.toLowerCase();
      if (s.includes('instagram') || s === 'ig') {
        source = 'Instagram';
        isInstagramTraffic = true;
      } else if (s.includes('facebook') || s === 'fb') {
        source = 'Facebook';
      } else if (s.includes('whatsapp') || s === 'wa') {
        source = 'WhatsApp';
      } else if (s.includes('google')) {
        source = 'Google';
      } else {
        source = utmSource;
      }
    } else if (ref.includes('instagram.com') || ref.includes('l.instagram.com') || ref.includes('android-app://com.instagram.android')) {
      source = 'Instagram';
      isInstagramTraffic = true;
    } else if (ua.includes('instagram')) {
      source = 'Instagram';
      isInstagramTraffic = true;
    } else if (ref.includes('facebook.com') || ref.includes('l.facebook.com')) {
      source = 'Facebook';
    } else if (ref.includes('whatsapp') || ref.includes('wa.me')) {
      source = 'WhatsApp';
    } else if (ref.includes('google.')) {
      source = 'Google';
    }

    return {
      source,
      is_instagram: isInstagramTraffic,
      referrer: document.referrer || 'Direct / None',
      utm_source: utmSource || '',
      utm_medium: utmMedium || '',
      utm_campaign: utmCampaign || '',
      utm_content: utmContent || '',
      utm_term: utmTerm || ''
    };
  }

  // 5. Detect Device, Browser & Operating System
  function detectClient() {
    const ua = navigator.userAgent || '';
    const width = window.screen.width || 0;
    const height = window.screen.height || 0;

    // Device Category
    let device = 'Desktop';
    if (/ipad|tablet|playbook|silk/i.test(ua) || (width >= 768 && width <= 1024)) {
      device = /ipad/i.test(ua) ? 'iPad Tablet' : 'Tablet';
    } else if (/mobile|iphone|ipod|android|blackberry|iemobile|kindle/i.test(ua) || width < 768) {
      device = /iphone/i.test(ua) ? 'iPhone Mobile' : (/android/i.test(ua) ? 'Android Mobile' : 'Mobile');
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

    // Screen, Language & Timezone
    let timezone = 'UTC';
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (e) {}

    const screenSize = (width && height) ? `${width}x${height}` : 'Not available';
    const language = navigator.language || 'en';

    return { device, os, browser, screenSize, language, timezone };
  }

  // Dispatch payload to backend without blocking user interactions
  function postToBackend(payload) {
    try {
      const body = JSON.stringify(payload);
      // Try primary API route first
      fetch('/api/notify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true
      }).catch(function () {
        // Fallback to direct Netlify function path if rewrite fails
        fetch('/.netlify/functions/notify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true
        }).catch(function () {});
      });
    } catch (e) {
      // Never crash client on network failure
    }
  }

  // 6. Handle "Will you love me?" YES / NO response clicks
  let lastResponseTime = 0;
  let lastResponseAnswer = '';

  window.sendLoveResponse = function (answerType) {
    const now = Date.now();
    // 4-second debounce to prevent spam / double-click duplicates
    if (answerType === lastResponseAnswer && now - lastResponseTime < 4000) {
      return;
    }
    lastResponseTime = now;
    lastResponseAnswer = answerType;

    const isYes = answerType.toLowerCase() === 'yes';
    const client = detectClient();
    const sourceData = getSourceData();
    const vInfo = getVisitorInfo();

    const payload = {
      event_type: isYes ? 'love_response_yes' : 'love_response_no',
      answer: isYes ? 'YES ❤️' : 'NO 💔',
      visitor_id: vInfo.vid,
      session_id: getSessionId(),
      time: getFormattedTimeIST(),
      source: sourceData.source,
      is_instagram: sourceData.is_instagram,
      referrer: sourceData.referrer,
      utm_source: sourceData.utm_source,
      utm_medium: sourceData.utm_medium,
      utm_campaign: sourceData.utm_campaign,
      utm_content: sourceData.utm_content,
      utm_term: sourceData.utm_term,
      device: client.device,
      browser: client.browser,
      os: client.os,
      screen_size: client.screenSize,
      language: client.language,
      timezone: client.timezone,
      page: 'LoveVerse',
      page_url: window.location.href,
      landing_page: window.location.pathname + window.location.search,
      visit_count: vInfo.count,
      is_new_visitor: vInfo.isNew
    };

    postToBackend(payload);
  };

  // 7. Track Instagram Profile Link Clicks
  let lastIgClickTime = 0;
  function setupInstagramTracking() {
    document.addEventListener('click', function (e) {
      const target = e.target.closest('[data-track="instagram"]');
      if (target) {
        const now = Date.now();
        if (now - lastIgClickTime < 10000) return; // 10s debounce
        lastIgClickTime = now;

        const client = detectClient();
        const sourceData = getSourceData();
        const vInfo = getVisitorInfo();

        postToBackend({
          event_type: 'instagram_click',
          visitor_id: vInfo.vid,
          session_id: getSessionId(),
          source: sourceData.source,
          is_instagram: sourceData.is_instagram,
          time: getFormattedTimeIST(),
          device: client.device,
          browser: client.browser,
          os: client.os,
          page: 'Instagram Profile Link (@Missyouyour6)',
          page_url: window.location.href,
          landing_page: window.location.pathname + window.location.search
        });
      }
    });
  }

  // 8. General tracking hook (preserves any page_view hooks)
  window.loveverseTrackEvent = function (name, data) {
    if (name === 'page_view') {
      const client = detectClient();
      const sourceData = getSourceData();
      const vInfo = getVisitorInfo();

      postToBackend(Object.assign({
        event_type: 'page_view',
        visitor_id: vInfo.vid,
        session_id: getSessionId(),
        source: sourceData.source,
        is_instagram: sourceData.is_instagram,
        time: getFormattedTimeIST(),
        device: client.device,
        browser: client.browser,
        os: client.os,
        page: data ? data.page : 'LoveVerse',
        page_url: window.location.href,
        landing_page: window.location.pathname + window.location.search
      }, data || {}));
    }
  };

  // 9. Initial Visitor Session Recording & Automatic Gmail Notification
  // Deduplicated per browser session via sessionStorage to prevent duplicate emails on reloads/renders
  const SESSION_KEY = 'lv_email_session_notified';
  if (!sessionStorage.getItem(SESSION_KEY)) {
    sessionStorage.setItem(SESSION_KEY, 'true');

    const client = detectClient();
    const sourceData = getSourceData();
    const vInfo = getVisitorInfo();

    const visitPayload = {
      event_type: 'new_visitor',
      visitor_id: vInfo.vid,
      session_id: getSessionId(),
      source: sourceData.source,
      is_instagram: sourceData.is_instagram,
      referrer: sourceData.referrer,
      utm_source: sourceData.utm_source,
      utm_medium: sourceData.utm_medium,
      utm_campaign: sourceData.utm_campaign,
      utm_content: sourceData.utm_content,
      utm_term: sourceData.utm_term,
      time: getFormattedTimeIST(),
      device: client.device,
      browser: client.browser,
      os: client.os,
      screen_size: client.screenSize,
      language: client.language,
      timezone: client.timezone,
      first_visit: vInfo.firstVisit,
      last_visit: vInfo.lastVisit,
      visit_count: vInfo.count,
      is_new_visitor: vInfo.isNew,
      page: 'LoveVerse Home',
      page_url: window.location.href,
      landing_page: window.location.pathname + window.location.search
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        postToBackend(visitPayload);
        setupInstagramTracking();
      });
    } else {
      postToBackend(visitPayload);
      setupInstagramTracking();
    }
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupInstagramTracking);
    } else {
      setupInstagramTracking();
    }
  }
})();
