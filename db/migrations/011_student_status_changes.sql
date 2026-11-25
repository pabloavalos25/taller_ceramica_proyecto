CREATE TABLE student_status_change_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES student_profiles(user_id),
  actor_id uuid NOT NULL,
  actor_role text NOT NULL DEFAULT 'ADMIN' CHECK (actor_role = 'ADMIN'),
  previous_active boolean NOT NULL,
  new_active boolean NOT NULL,
  fee_start_period date,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (actor_id, actor_role) REFERENCES users(id, role),
  CHECK (previous_active <> new_active),
  CHECK ((new_active AND fee_start_period IS NOT NULL AND extract(day FROM fee_start_period) = 1) OR (NOT new_active AND fee_start_period IS NULL))
);
CREATE INDEX student_status_change_events_student_idx ON student_status_change_events(student_id, occurred_at, id);