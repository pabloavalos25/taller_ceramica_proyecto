CREATE TABLE login_throttle (
  bucket text PRIMARY KEY CHECK (bucket ~ '^[0-9a-f]{64}$'),
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now()
);