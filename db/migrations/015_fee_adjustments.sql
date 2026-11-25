ALTER TABLE charges ADD CONSTRAINT charges_id_student_fee_unique UNIQUE (id, student_id, monthly_fee_id);
CREATE TABLE fee_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_id uuid NOT NULL,
  student_id uuid NOT NULL,
  charge_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  actor_role text NOT NULL DEFAULT 'ADMIN' CHECK (actor_role = 'ADMIN'),
  previous_cents bigint NOT NULL CHECK (previous_cents >= 0),
  new_cents bigint NOT NULL CHECK (new_cents >= 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  idempotency_key uuid NOT NULL UNIQUE,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (fee_id,student_id) REFERENCES monthly_fees(id,student_id),
  FOREIGN KEY (charge_id,student_id,fee_id) REFERENCES charges(id,student_id,monthly_fee_id),
  FOREIGN KEY (actor_id,actor_role) REFERENCES users(id,role),
  CHECK (previous_cents <> new_cents)
);
CREATE INDEX fee_adjustments_fee_idx ON fee_adjustments(fee_id,occurred_at,id);