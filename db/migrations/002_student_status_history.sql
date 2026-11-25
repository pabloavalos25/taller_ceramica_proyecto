CREATE TABLE student_status_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES student_profiles(user_id),
  active boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX student_status_history_student_idx ON student_status_history (student_id, recorded_at, id);

CREATE FUNCTION record_student_status_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.active IS DISTINCT FROM NEW.active THEN
    INSERT INTO student_status_history (student_id, active) VALUES (NEW.user_id, NEW.active);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER student_status_history_record
AFTER INSERT OR UPDATE OF active ON student_profiles
FOR EACH ROW EXECUTE FUNCTION record_student_status_change();
-- Registrar el estado conocido al migrar; no reconstruye historial anterior.
INSERT INTO student_status_history (student_id, active) SELECT user_id, active FROM student_profiles;
