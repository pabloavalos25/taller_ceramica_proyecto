-- Ejecutar únicamente en la base de producción correcta, después de verificar el destino.
BEGIN;
SELECT pg_advisory_xact_lock(1937074537);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name='023_student_branch.sql' AND checksum='1f8a52d9568a9788553e1c5d9e89ec0f1c552d6fcc2ea4bbcc47b22c4fec5093')
     OR EXISTS (SELECT 1 FROM schema_migrations WHERE name >= '024_fee_tier_schedules.sql')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='student_profiles' AND column_name='branch') THEN
    RAISE EXCEPTION 'La base o el estado de las migraciones requiere revisión';
  END IF;
END $$;

CREATE TABLE fee_tier_schedules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  effective_period date NOT NULL CHECK (extract(day FROM effective_period) = 1),
  actor_id uuid,
  actor_role text NOT NULL DEFAULT 'ADMIN' CHECK (actor_role='ADMIN'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(actor_id,actor_role) REFERENCES users(id,role)
);
CREATE INDEX fee_tier_schedules_period_idx ON fee_tier_schedules(effective_period DESC,id DESC);

CREATE TABLE fee_tier_rules (
  schedule_id bigint NOT NULL REFERENCES fee_tier_schedules(id),
  start_day smallint NOT NULL CHECK (start_day BETWEEN 1 AND 31),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  PRIMARY KEY(schedule_id,start_day)
);

CREATE TABLE fee_tier_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fee_id uuid NOT NULL,
  charge_id uuid NOT NULL,
  student_id uuid NOT NULL,
  schedule_id bigint NOT NULL REFERENCES fee_tier_schedules(id),
  previous_cents bigint NOT NULL CHECK (previous_cents >= 0),
  new_cents bigint NOT NULL CHECK (new_cents > previous_cents),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(charge_id,new_cents),
  FOREIGN KEY(fee_id,student_id) REFERENCES monthly_fees(id,student_id),
  FOREIGN KEY(charge_id,student_id,fee_id) REFERENCES charges(id,student_id,monthly_fee_id)
);

WITH initial AS (INSERT INTO fee_tier_schedules(effective_period) VALUES ('2026-12-01') RETURNING id)
INSERT INTO fee_tier_rules(schedule_id,start_day,amount_cents)
SELECT initial.id, rule.start_day, rule.amount_cents FROM initial CROSS JOIN (VALUES
  (1,4500000::bigint),(11,5000000::bigint),(21,6000000::bigint),(31,7500000::bigint)
) AS rule(start_day,amount_cents);

INSERT INTO schema_migrations(name,checksum) VALUES ('024_fee_tier_schedules.sql','a2fbddf40343e6a625784330e818098fa13fcd52e880d5f413bae10b31e0b015');
COMMIT;
