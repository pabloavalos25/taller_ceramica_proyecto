ALTER TABLE material_batch_items ADD CONSTRAINT material_item_identity_unique UNIQUE(id,charge_id,student_id);
CREATE TABLE material_item_corrections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL, charge_id uuid NOT NULL, student_id uuid NOT NULL,
 actor_id uuid NOT NULL, actor_role text NOT NULL DEFAULT 'ADMIN' CHECK(actor_role='ADMIN'),
 action text NOT NULL CHECK(action IN ('ADJUST','VOID')), previous_cents bigint NOT NULL CHECK(previous_cents>=0),
 new_cents bigint NOT NULL CHECK(new_cents>=0), reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 500),
 idempotency_key uuid NOT NULL UNIQUE, request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((action='VOID' AND new_cents=0) OR (action='ADJUST' AND previous_cents<>new_cents)),
 FOREIGN KEY(item_id,charge_id,student_id) REFERENCES material_batch_items(id,charge_id,student_id),
 FOREIGN KEY(actor_id,actor_role) REFERENCES users(id,role)
);
CREATE UNIQUE INDEX material_item_one_void ON material_item_corrections(item_id) WHERE action='VOID';
CREATE INDEX material_corrections_item_idx ON material_item_corrections(item_id,created_at);
