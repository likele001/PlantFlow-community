-- Add expires_at column to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
