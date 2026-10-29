require('dotenv').config();
const crypto = require('crypto');
const { readStoredEvents } = require('./notify-email');

// Configured admin password (default: loveverse2026)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'loveverse2026';
// Derive token using HMAC-SHA256 so it is not trivially reversible from base64
const ADMIN_TOKEN = 'lv_' + crypto.createHmac('sha256', 'loveverse-admin-secret').update(ADMIN_PASSWORD).digest('hex').slice(0, 32);

function isAuthenticated(headers = {}, params = {}) {
  let auth = '';
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    if (lk === 'authorization' || lk === 'x-admin-token') {
      auth = v;
      break;
    }
  }
  if (!auth && params.auth) auth = params.auth;
  const token = (auth || '').replace(/^Bearer\s+/i, '').trim();
  return token === ADMIN_TOKEN;
}

// Derive location from timezone or IP
function deriveLocation(timezone = '', ip = '') {
  if (timezone && timezone !== 'UTC') {
    const parts = timezone.split('/');
    if (parts.length > 1) {
      return parts[1].replace(/_/g, ' ') + ` (${parts[0]})`;
    }
    return timezone;
  }
  return 'Global / Online';
}

// Compute overview statistics & charts from real events
function computeStats(events = []) {
  const visitorMap = new Map();
  // Track unique visitor IDs seen per day for dailyVisitors count
  const dayVisitorSets = {};
  let totalVisits = 0;
  let instagramVisits = 0;
  let instagramClicks = 0;
  let pageViews = 0;
  let yesResponses = 0;
  let noResponses = 0;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayVisitorsSet = new Set();
  // A visitor is "new" if their first-ever event has is_new_visitor=true
  const firstSeenSet = new Set();

  const sourceCounts = {};
  const deviceCounts = {};
  const browserCounts = {};
  const osCounts = {};
  const dayCounts = {};

  // Initialize last 7 days in dayCounts
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    dayCounts[d] = 0;
  }

  events.forEach(ev => {
    const vid = ev.visitor_id || 'UNKNOWN';
    const day = (ev.timestamp || ev.recorded_at || '').slice(0, 10);

    if (ev.event_type === 'new_visitor') {
      totalVisits++;
      if (dayCounts[day] !== undefined) dayCounts[day]++;
      if (day === todayStr) todayVisitorsSet.add(vid);

      const src = ev.source || 'Direct / Unknown';
      if (src.toLowerCase().includes('instagram')) instagramVisits++;
    }

    if (ev.event_type === 'page_view') pageViews++;
    if (ev.event_type === 'instagram_click') instagramClicks++;
    if (ev.event_type === 'love_response_yes') yesResponses++;
    if (ev.event_type === 'love_response_no') noResponses++;

    const src = ev.source || 'Direct / Unknown';
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    if (ev.device) deviceCounts[ev.device] = (deviceCounts[ev.device] || 0) + 1;
    if (ev.browser) browserCounts[ev.browser] = (browserCounts[ev.browser] || 0) + 1;
    if (ev.os) osCounts[ev.os] = (osCounts[ev.os] || 0) + 1;

    // Track unique visitors — first event seen per visitor
    if (!visitorMap.has(vid)) {
      // Mark as new if explicitly flagged or if it's their first new_visitor event
      if (ev.is_new_visitor === true || (!firstSeenSet.has(vid) && ev.event_type === 'new_visitor')) {
        firstSeenSet.add(vid);
      }
      visitorMap.set(vid, {
        visitor_id: vid,
        first_visit: ev.first_visit || ev.timestamp || ev.recorded_at,
        last_visit: ev.timestamp || ev.recorded_at,
        visit_count: ev.visit_count || 1,
        source: src,
        referrer: ev.referrer || 'Direct',
        device: ev.device || 'Unknown',
        browser: ev.browser || 'Unknown',
        os: ev.os || 'Unknown',
        screen_size: ev.screen_size || '',
        language: ev.language || 'en',
        timezone: ev.timezone || 'UTC',
        location: deriveLocation(ev.timezone, ev.ip),
        last_answer: ev.answer || '',
        events_count: 1
      });
    } else {
      const v = visitorMap.get(vid);
      v.last_visit = ev.timestamp || ev.recorded_at;
      v.visit_count = Math.max(v.visit_count, ev.visit_count || 1);
      if (ev.answer) v.last_answer = ev.answer;
      v.events_count++;
    }
  });

  const uniqueVisitors = visitorMap.size;
  const newVisitors = firstSeenSet.size;
  // Returning = unique visitors who were NOT flagged as brand-new on their first event
  const returningVisitors = Math.max(0, uniqueVisitors - newVisitors);

  return {
    overview: {
      totalVisits: Math.max(totalVisits, uniqueVisitors),
      uniqueVisitors,
      todayVisitors: todayVisitorsSet.size,
      instagramVisitors: instagramVisits,
      instagramClicks,
      newVisitors,
      returningVisitors,
      pageViews: Math.max(pageViews, totalVisits),
      yesResponses,
      noResponses
    },
    charts: {
      byDay: Object.entries(dayCounts).map(([date, count]) => ({ date, count })),
      sources: sourceCounts,
      devices: deviceCounts,
      browsers: browserCounts,
      operatingSystems: osCounts
    }
  };
}

// Get filtered and paginated visitor records
function getVisitorsList(events = [], query = {}) {
  const visitorMap = new Map();

  events.forEach(ev => {
    const vid = ev.visitor_id || 'UNKNOWN';
    if (!visitorMap.has(vid)) {
      visitorMap.set(vid, {
        visitor_id: vid,
        first_visit: ev.first_visit || ev.timestamp || ev.recorded_at,
        last_visit: ev.timestamp || ev.recorded_at,
        visit_count: ev.visit_count || 1,
        source: ev.source || 'Direct / Unknown',
        referrer: ev.referrer || 'Direct',
        device: ev.device || 'Unknown',
        browser: ev.browser || 'Unknown',
        os: ev.os || 'Unknown',
        screen_size: ev.screen_size || 'N/A',
        language: ev.language || 'en',
        timezone: ev.timezone || 'UTC',
        location: deriveLocation(ev.timezone, ev.ip),
        last_answer: ev.answer || '—',
        timestamp: ev.timestamp || ev.recorded_at
      });
    } else {
      const v = visitorMap.get(vid);
      v.last_visit = ev.timestamp || ev.recorded_at;
      v.visit_count = Math.max(v.visit_count, ev.visit_count || 1);
      if (ev.answer) v.last_answer = ev.answer;
    }
  });

  let list = Array.from(visitorMap.values());

  // Search filter
  if (query.search) {
    const q = query.search.toLowerCase();
    list = list.filter(v =>
      v.visitor_id.toLowerCase().includes(q) ||
      v.source.toLowerCase().includes(q) ||
      v.device.toLowerCase().includes(q) ||
      v.browser.toLowerCase().includes(q) ||
      v.os.toLowerCase().includes(q) ||
      v.location.toLowerCase().includes(q)
    );
  }

  // Source filter
  if (query.source && query.source !== 'All') {
    list = list.filter(v => v.source.toLowerCase().includes(query.source.toLowerCase()));
  }

  // Device filter
  if (query.device && query.device !== 'All') {
    list = list.filter(v => v.device.toLowerCase().includes(query.device.toLowerCase()));
  }

  // Date filter (Today, Yesterday, Last 7 Days, All)
  if (query.dateFilter && query.dateFilter !== 'All') {
    const now = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(now - 86400000).toISOString().slice(0, 10);
    const sevenDaysAgo = now - 7 * 86400000;

    list = list.filter(v => {
      const vDate = (v.last_visit || '').slice(0, 10);
      const vTime = new Date(v.last_visit || 0).getTime();
      if (query.dateFilter === 'Today') return vDate === todayStr;
      if (query.dateFilter === 'Yesterday') return vDate === yesterdayStr;
      if (query.dateFilter === '7Days') return vTime >= sevenDaysAgo;
      return true;
    });
  }

  // Sorting
  const sortBy = query.sortBy || 'last_visit';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    if (a[sortBy] < b[sortBy]) return -1 * sortOrder;
    if (a[sortBy] > b[sortBy]) return 1 * sortOrder;
    return 0;
  });

  // Pagination
  const page = parseInt(query.page || '1', 10);
  const limit = parseInt(query.limit || '15', 10);
  const total = list.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const paginated = list.slice((page - 1) * limit, page * limit);

  return {
    visitors: paginated,
    pagination: {
      page,
      limit,
      total,
      totalPages
    }
  };
}

// Generate CSV string from all recorded events
function generateCSV(events = []) {
  const headers = [
    'Visitor ID',
    'Session ID',
    'Event Type',
    'Answer',
    'Source',
    'Referrer',
    'Device',
    'Browser',
    'Operating System',
    'Screen Size',
    'Timezone',
    'Date & Time (UTC)'
  ];

  const rows = events.map(ev => [
    `"${ev.visitor_id || ''}"`,
    `"${ev.session_id || ''}"`,
    `"${ev.event_type || ''}"`,
    `"${ev.answer || ''}"`,
    `"${ev.source || ''}"`,
    `"${ev.referrer || ''}"`,
    `"${ev.device || ''}"`,
    `"${ev.browser || ''}"`,
    `"${ev.os || ''}"`,
    `"${ev.screen_size || ''}"`,
    `"${ev.timezone || ''}"`,
    `"${ev.timestamp || ev.recorded_at || ''}"`
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

// Express / Netlify handler routing logic
async function handleAdminRequest(action, params = {}, headers = {}, body = {}) {
  // 1. Login action (public)
  if (action === 'login') {
    const pwd = body.password || '';
    if (pwd === ADMIN_PASSWORD) {
      return { status: 200, data: { success: true, token: ADMIN_TOKEN } };
    }
    return { status: 401, data: { success: false, error: 'Invalid admin password' } };
  }

  // Protect all other admin endpoints
  if (!isAuthenticated(headers, params)) {
    return { status: 401, data: { success: false, error: 'Unauthorized: Admin authentication required' } };
  }

  const events = readStoredEvents();

  // 2. Overview Stats & Charts
  if (action === 'stats') {
    const stats = computeStats(events);
    return { status: 200, data: { success: true, ...stats } };
  }

  // 3. Visitors Table with filters & pagination
  if (action === 'visitors') {
    const result = getVisitorsList(events, params);
    return { status: 200, data: { success: true, ...result } };
  }

  // 4. Single Visitor Details & Activity Timeline
  if (action === 'visitor_detail') {
    const vid = params.id;
    const visitorEvents = events.filter(e => e.visitor_id === vid);
    if (!visitorEvents.length) {
      return { status: 404, data: { success: false, error: 'Visitor not found' } };
    }
    const latest = visitorEvents[visitorEvents.length - 1];
    const details = {
      visitor_id: vid,
      first_visit: visitorEvents[0].timestamp || visitorEvents[0].recorded_at,
      last_visit: latest.timestamp || latest.recorded_at,
      visit_count: Math.max(...visitorEvents.map(e => e.visit_count || 1)),
      source: latest.source,
      referrer: latest.referrer || 'Direct',
      device: latest.device,
      browser: latest.browser,
      os: latest.os,
      screen_size: latest.screen_size || 'N/A',
      language: latest.language || 'en',
      timezone: latest.timezone || 'UTC',
      location: deriveLocation(latest.timezone, latest.ip),
      timeline: visitorEvents.map(e => ({
        event_type: e.event_type,
        answer: e.answer,
        page: e.page,
        timestamp: e.timestamp || e.recorded_at
      }))
    };
    return { status: 200, data: { success: true, visitor: details } };
  }

  // 5. CSV Export
  if (action === 'export_csv') {
    const csvContent = generateCSV(events);
    return {
      status: 200,
      isCsv: true,
      data: csvContent
    };
  }

  return { status: 400, data: { error: 'Unknown admin action' } };
}

// Netlify Function Export
exports.handler = async (event, context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const pathParts = (event.path || '').split('/').filter(Boolean);
  const action = event.queryStringParameters?.action || pathParts[pathParts.length - 1] || 'stats';
  const params = event.queryStringParameters || {};
  let body = {};
  try {
    if (event.body) body = JSON.parse(event.body);
  } catch (e) {}

  const result = await handleAdminRequest(action, params, event.headers, body);

  if (result.isCsv) {
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="loveverse_visitors.csv"'
      },
      body: result.data
    };
  }

  return {
    statusCode: result.status,
    headers: corsHeaders,
    body: JSON.stringify(result.data)
  };
};

exports.handleAdminRequest = handleAdminRequest;
exports.computeStats = computeStats;
exports.getVisitorsList = getVisitorsList;
exports.generateCSV = generateCSV;
exports.ADMIN_PASSWORD = ADMIN_PASSWORD;
exports.ADMIN_TOKEN = ADMIN_TOKEN;
