ALTER TABLE monthly_fees ADD CONSTRAINT monthly_fees_id_student_unique UNIQUE (id, student_id);

CREATE TABLE charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES student_profiles(user_id),
  category text NOT NULL CHECK (category IN ('FEE', 'KILN', 'MATERIAL')),
  monthly_fee_id uuid,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, student_id),
  UNIQUE (monthly_fee_id),
  FOREIGN KEY (monthly_fee_id, student_id) REFERENCES monthly_fees(id, student_id),
  CHECK ((category = 'FEE' AND monthly_fee_id IS NOT NULL) OR (category <> 'FEE' AND monthly_fee_id IS NULL))
);
CREATE INDEX charges_student_idx ON charges (student_id, created_at);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES student_profiles(user_id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  method text NOT NULL CHECK (method IN ('CASH', 'TRANSFER', 'MERCADO_PAGO', 'OTHER')),
  recorded_by uuid NOT NULL,
  recorded_by_role text NOT NULL DEFAULT 'ADMIN' CHECK (recorded_by_role = 'ADMIN'),
  paid_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE (id, student_id),
  FOREIGN KEY (recorded_by, recorded_by_role) REFERENCES users(id, role)
);
CREATE INDEX payments_student_idx ON payments (student_id, paid_at);

CREATE TABLE payment_allocations (
  payment_id uuid NOT NULL,
  charge_id uuid NOT NULL,
  student_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  PRIMARY KEY (payment_id, charge_id),
  FOREIGN KEY (payment_id, student_id) REFERENCES payments(id, student_id),
  FOREIGN KEY (charge_id, student_id) REFERENCES charges(id, student_id)
);
CREATE INDEX payment_allocations_charge_idx ON payment_allocations (charge_id);