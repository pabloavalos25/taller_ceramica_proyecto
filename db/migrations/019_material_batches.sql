CREATE TABLE material_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), consumption_date date NOT NULL,
 billing_period date NOT NULL CHECK(EXTRACT(day FROM billing_period)=1),
 actor_id uuid NOT NULL, actor_role text NOT NULL DEFAULT 'ADMIN' CHECK(actor_role='ADMIN'),
 idempotency_key uuid NOT NULL UNIQUE, request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(actor_id,actor_role) REFERENCES users(id,role)
);
CREATE TABLE material_batch_students (
 batch_id uuid NOT NULL REFERENCES material_batches(id), student_id uuid NOT NULL REFERENCES student_profiles(user_id),
 inactive_confirmed boolean NOT NULL DEFAULT false, PRIMARY KEY(batch_id,student_id)
);
CREATE TABLE material_batch_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL, student_id uuid NOT NULL,
 material_id uuid NOT NULL REFERENCES materials(id), charge_id uuid NOT NULL UNIQUE,
 charge_category text NOT NULL DEFAULT 'MATERIAL' CHECK(charge_category='MATERIAL'),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200), unit text NOT NULL,
 quantity numeric(20,3) NOT NULL CHECK(quantity>0), unit_price_cents bigint NOT NULL CHECK(unit_price_cents>=0),
 subtotal_cents bigint NOT NULL CHECK(subtotal_cents>=0), zero_price_reason text CHECK(length(zero_price_reason)<=500),
 CHECK(unit_price_cents<>0 OR length(btrim(coalesce(zero_price_reason,'')))>0),
 CHECK(subtotal_cents::numeric=floor(quantity*unit_price_cents::numeric+0.5)),
 FOREIGN KEY(batch_id,student_id) REFERENCES material_batch_students(batch_id,student_id),
 FOREIGN KEY(charge_id,student_id,charge_category) REFERENCES charges(id,student_id,category)
);
CREATE INDEX material_batches_period_idx ON material_batches(billing_period,consumption_date);
CREATE INDEX material_items_student_idx ON material_batch_items(student_id,batch_id);
