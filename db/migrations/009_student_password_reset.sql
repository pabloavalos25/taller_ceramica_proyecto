CREATE TABLE student_password_reset_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_role text NOT NULL DEFAULT 'ADMIN' CHECK (actor_role = 'ADMIN'),
  student_id uuid NOT NULL REFERENCES student_profiles(user_id),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (actor_id, actor_role) REFERENCES users(id, role)
);
CREATE INDEX student_password_reset_events_student_idx ON student_password_reset_events(student_id, occurred_at);