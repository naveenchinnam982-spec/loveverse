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
    event_type VARCHAR(64) NOT NULL,          -- 'new_visitor', 'love_response_yes', 'love_response_no', 'instagram_click'
    answer VARCHAR(64),                       -- 'YES ❤️', 'NO 💔', or NULL
    source VARCHAR(255) DEFAULT 'Direct / Unknown', -- 'Instagram', 'Google', 'Direct / Unknown', etc.
    device VARCHAR(64),                       -- 'Mobile', 'Desktop', 'Tablet'
    browser VARCHAR(64),                      -- 'Chrome', 'Instagram In-App Browser', 'Safari', etc.
    os VARCHAR(64),                           -- 'iOS', 'Android', 'Windows', 'macOS'
    page VARCHAR(255) DEFAULT 'LoveVerse',
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_visitor_events_visitor_id ON visitor_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_events_event_type ON visitor_events(event_type);
CREATE INDEX IF NOT EXISTS idx_visitor_events_created_at ON visitor_events(created_at);
CREATE INDEX IF NOT EXISTS idx_visitor_events_source ON visitor_events(source);
