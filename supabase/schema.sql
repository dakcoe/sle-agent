-- Users table (admins and regular users)
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  admin_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS enabled; all access goes through service_role key (bypasses RLS)
-- so no policies are needed — anon/authenticated keys cannot read this table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Index for fast lookup by username
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
-- Index for finding users linked to an admin
CREATE INDEX IF NOT EXISTS idx_users_admin_id ON users(admin_id);
