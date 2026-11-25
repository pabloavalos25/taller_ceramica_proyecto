ALTER TABLE charges ADD CONSTRAINT charges_id_student_category_unique UNIQUE (id, student_id, category);

CREATE TABLE kiln_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firing_date date NOT NULL,
  billing_period date NOT NULL CHECK (EXTRACT(day FROM billing_period)=1),
  reference text CHECK (reference IS NULL OR length(reference)<=200),
  notes text CHECK (notes IS NULL OR length(notes)<=2000),
  actor_id uuid NOT NULL,
  actor_role text NOT NULL DEFAULT 'ADMIN' CHECK (actor_role='ADMIN'),
  idempotency_key uuid NOT NULL UNIQUE,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (actor_id,actor_role) REFERENCES users(id,role)
);
CREATE TABLE kiln_batch_students (
  batch_id uuid NOT NULL REFERENCES kiln_batches(id),
  student_id uuid NOT NULL REFERENCES student_profiles(user_id),
  inactive_confirmed boolean NOT NULL DEFAULT false,
  PRIMARY KEY(batch_id,student_id)
);
CREATE TABLE kiln_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  student_id uuid NOT NULL,
  charge_id uuid NOT NULL UNIQUE,
  charge_category text NOT NULL DEFAULT 'KILN' CHECK (charge_category='KILN'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  firing_type text NOT NULL CHECK (firing_type IN ('BISQUE','GLAZE','OTHER')),
  quantity integer NOT NULL CHECK (quantity>0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents>=0),
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents>=0),
  zero_price_reason text,
  notes text CHECK (notes IS NULL OR length(notes)<=2000),
  piece_reference text CHECK (piece_reference IS NULL OR length(piece_reference)<=200),
  CHECK (unit_price_cents<>0 OR (zero_price_reason IS NOT NULL AND length(btrim(zero_price_reason))>0)),
  CHECK (subtotal_cents::numeric=quantity::numeric*unit_price_cents::numeric),
  FOREIGN KEY(batch_id,student_id) REFERENCES kiln_batch_students(batch_id,student_id),
  FOREIGN KEY(charge_id,student_id,charge_category) REFERENCES charges(id,student_id,category)
);
CREATE INDEX kiln_batches_period_idx ON kiln_batches(billing_period,firing_date);
CREATE INDEX kiln_items_student_idx ON kiln_batch_items(student_id,batch_id);
