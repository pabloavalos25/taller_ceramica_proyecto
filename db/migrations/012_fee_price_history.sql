CREATE TABLE fee_price_lock (id boolean PRIMARY KEY DEFAULT true CHECK (id));
INSERT INTO fee_price_lock(id) VALUES (true);
CREATE TABLE fee_price_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  effective_period date NOT NULL CHECK (extract(day FROM effective_period) = 1),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  actor_id uuid NOT NULL,
  actor_role text NOT NULL DEFAULT 'ADMIN' CHECK (actor_role = 'ADMIN'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (actor_id, actor_role) REFERENCES users(id, role)
);
CREATE INDEX fee_price_history_period_idx ON fee_price_history (effective_period DESC, id DESC);