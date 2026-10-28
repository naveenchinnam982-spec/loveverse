-- =====================================================================
-- LoveVerse Website — Analytics & Notification Events Database Schema
-- Compatible with PostgreSQL, Supabase, Neon, AWS RDS, and SQLite
-- =====================================================================

-- 1. Table: visitor_events
-- Stores all tracked visitor sessions, love responses (YES ❤️ / NO 💔), 
-- Instagram clicks, and traffic source attribution.
CREATE TABLE IF NOT EXISTS visitor_events (
    id SERIAL PRIMARY KEY,
    visitor_id VARCHAR(64) NOT NULL,
    session_id VARCHAR(64),
    event_type VARCHAR(64) NOT NULL,          -- 'new_visitor', 'love_response_yes', 'love_response_no', 'instagram_click', 'page_view'
    answer VARCHAR(64),                       -- 'YES ❤️', 'NO 💔', or NULL
    source VARCHAR(255) DEFAULT 'Direct / Unknown', -- 'Instagram', 'Google', 'Direct / Unknown', etc.
    referrer VARCHAR(512),
    utm_source VARCHAR(128),
    utm_medium VARCHAR(128),
    utm_campaign VARCHAR(128),
    utm_content VARCHAR(128),
    utm_term VARCHAR(128),
    device VARCHAR(64),                       -- 'Android Mobile', 'iPhone Mobile', 'Desktop', 'Tablet'
    browser VARCHAR(64),                      -- 'Chrome', 'Instagram In-App Browser', 'Safari', etc.
    os VARCHAR(64),                           -- 'Android', 'iOS', 'Windows', 'macOS'
    screen_size VARCHAR(32),                  -- '1920x1080', '390x844'
    language VARCHAR(32),                     -- 'en-US', 'en-GB'
    timezone VARCHAR(64),                     -- 'Asia/Kolkata', 'America/New_York'
    is_new_visitor BOOLEAN DEFAULT TRUE,
    visit_count INTEGER DEFAULT 1,
    page VARCHAR(255) DEFAULT 'LoveVerse Home',
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_visitor_events_visitor_id ON visitor_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_events_event_type ON visitor_events(event_type);
CREATE INDEX IF NOT EXISTS idx_visitor_events_created_at ON visitor_events(created_at);
CREATE INDEX IF NOT EXISTS idx_visitor_events_source ON visitor_events(source);
CREATE INDEX IF NOT EXISTS idx_visitor_events_device ON visitor_events(device);
