CREATE TABLE IF NOT EXISTS students (
  student_id TEXT PRIMARY KEY,
  student_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  baseline_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sites (
  site_name TEXT PRIMARY KEY,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  timestamp_utc TIMESTAMPTZ NOT NULL,
  local_date DATE NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  action TEXT NOT NULL,
  site TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shifts (
  shift_id TEXT PRIMARY KEY,
  local_date DATE NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  site TEXT NOT NULL,
  check_in_utc TIMESTAMPTZ,
  check_out_utc TIMESTAMPTZ,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  hours_decimal NUMERIC(10,2) NOT NULL DEFAULT 0,
  check_in_points INTEGER NOT NULL DEFAULT 0,
  check_out_points INTEGER NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  source TEXT NOT NULL DEFAULT 'web',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shifts_student_day_unique UNIQUE (student_id, local_date)
);

CREATE TABLE IF NOT EXISTS points (
  student_id TEXT PRIMARY KEY,
  student_name TEXT NOT NULL,
  baseline_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  earned_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  local_date DATE NOT NULL,
  actor_type TEXT NOT NULL,
  student_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  outcome_code TEXT NOT NULL,
  message TEXT NOT NULL,
  site TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_events_student_date ON attendance_events(student_id, local_date DESC);
CREATE INDEX IF NOT EXISTS idx_shifts_local_date ON shifts(local_date DESC);
CREATE INDEX IF NOT EXISTS idx_shifts_site ON shifts(site);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
