-- Additive only: existing users remain unchanged until a principal is selected
-- explicitly. This schema does not grant or enforce administrative access.
CREATE TABLE admin_profiles (
  user_id uuid PRIMARY KEY,
  user_role text NOT NULL DEFAULT 'ADMIN' CHECK (user_role = 'ADMIN'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),
  access_level text NOT NULL CHECK (access_level IN ('PRINCIPAL', 'TEACHER')),
  active boolean NOT NULL DEFAULT true,
  FOREIGN KEY (user_id, user_role) REFERENCES users(id, role)
);

CREATE UNIQUE INDEX admin_profiles_one_principal
  ON admin_profiles (access_level) WHERE access_level = 'PRINCIPAL';

CREATE TABLE admin_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES admin_profiles(user_id),
  target_id uuid NOT NULL REFERENCES admin_profiles(user_id),
  event_type text NOT NULL CHECK (event_type IN ('CREATED','DEACTIVATED')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE student_profiles
  ADD COLUMN teacher_id uuid REFERENCES admin_profiles(user_id);

-- Append one record per assignment in the same transaction as a change.
CREATE TABLE student_teacher_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  student_id uuid NOT NULL REFERENCES student_profiles(user_id),
  teacher_id uuid NOT NULL REFERENCES admin_profiles(user_id),
  actor_id uuid NOT NULL REFERENCES admin_profiles(user_id),
  assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_teacher_history_student_idx
  ON student_teacher_history (student_id, assigned_at DESC);
