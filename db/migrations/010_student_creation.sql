CREATE TABLE student_fee_preferences (
  student_id uuid PRIMARY KEY REFERENCES student_profiles(user_id),
  start_period date NOT NULL CHECK (extract(day FROM start_period) = 1)
);
CREATE TABLE student_creation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_role text NOT NULL DEFAULT 'ADMIN' CHECK (actor_role = 'ADMIN'),
  student_id uuid NOT NULL UNIQUE REFERENCES student_profiles(user_id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (actor_id, actor_role) REFERENCES users(id, role)
);