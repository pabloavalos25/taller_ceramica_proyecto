CREATE TABLE fee_due_day_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  effective_period date NOT NULL CHECK (extract(day FROM effective_period) = 1),
  due_day smallint NOT NULL CHECK (due_day BETWEEN 1 AND 28),
  actor_id uuid NOT NULL,
  actor_role text NOT NULL DEFAULT 'ADMIN' CHECK (actor_role = 'ADMIN'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (actor_id, actor_role) REFERENCES users(id, role)
);
CREATE INDEX fee_due_day_history_period_idx ON fee_due_day_history (effective_period DESC, id DESC);