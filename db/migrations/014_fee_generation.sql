CREATE TABLE fee_generation_runs (
  period date PRIMARY KEY CHECK (extract(day FROM period) = 1),
  last_completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  total_created bigint NOT NULL DEFAULT 0 CHECK (total_created >= 0),
  last_created integer NOT NULL DEFAULT 0 CHECK (last_created >= 0)
);