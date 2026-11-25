CREATE TABLE password_change_throttle (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now()
);