CREATE TABLE materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
  category text NOT NULL CHECK(length(btrim(category)) BETWEEN 1 AND 120),
  description text CHECK(description IS NULL OR length(description)<=2000),
  unit text NOT NULL CHECK(unit IN ('UNIT','G','KG','ML','L','CUSTOM')),
  custom_unit text,
  price_cents bigint NOT NULL CHECK(price_cents>=0),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((unit='CUSTOM' AND custom_unit IS NOT NULL AND length(btrim(custom_unit)) BETWEEN 1 AND 80) OR (unit<>'CUSTOM' AND custom_unit IS NULL))
);
CREATE INDEX materials_name_idx ON materials(lower(name),id);
CREATE TABLE material_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES materials(id),
  actor_id uuid NOT NULL,
  actor_role text NOT NULL DEFAULT 'ADMIN' CHECK(actor_role='ADMIN'),
  previous_data jsonb,
  new_data jsonb NOT NULL,
  idempotency_key uuid NOT NULL UNIQUE,
  request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(actor_id,actor_role) REFERENCES users(id,role)
);
CREATE INDEX material_events_material_idx ON material_events(material_id,created_at);
