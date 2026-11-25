CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  password_hash text NOT NULL CHECK (length(password_hash) > 0),
  role text NOT NULL CHECK (role IN ('ADMIN', 'USER')),
  must_change_password boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, role)
);

CREATE TABLE student_profiles (
  user_id uuid PRIMARY KEY,
  user_role text NOT NULL DEFAULT 'USER' CHECK (user_role = 'USER'),
  full_name text NOT NULL CHECK (length(btrim(full_name)) > 0),
  phone text,
  enrolled_on date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  FOREIGN KEY (user_id, user_role) REFERENCES users (id, role)
);

CREATE TABLE student_attendance_days (
  student_id uuid NOT NULL REFERENCES student_profiles(user_id),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 6),
  PRIMARY KEY (student_id, weekday)
);

CREATE TABLE monthly_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES student_profiles(user_id),
  period_year smallint NOT NULL CHECK (period_year BETWEEN 1 AND 9999),
  period_month smallint NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  original_cents bigint NOT NULL CHECK (original_cents >= 0),
  due_date date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, period_year, period_month)
);
CREATE INDEX monthly_fees_period_idx ON monthly_fees (period_year, period_month);
