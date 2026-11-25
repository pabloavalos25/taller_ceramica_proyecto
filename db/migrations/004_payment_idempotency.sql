ALTER TABLE payments ADD COLUMN idempotency_key uuid UNIQUE;
ALTER TABLE payments ADD COLUMN request_fingerprint text;
ALTER TABLE payments ADD CONSTRAINT payment_idempotency_pair CHECK ((idempotency_key IS NULL) = (request_fingerprint IS NULL));
CREATE TABLE payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  actor_id uuid NOT NULL,
  actor_role text NOT NULL DEFAULT 'ADMIN' CHECK (actor_role = 'ADMIN'),
  event_type text NOT NULL CHECK (event_type = 'CREATED'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (actor_id, actor_role) REFERENCES users(id, role)
);