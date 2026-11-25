ALTER TABLE student_profiles ADD COLUMN branch text
  CHECK (branch IS NULL OR branch IN ('GODOY_CRUZ', 'LUJAN_DE_CUYO'));
CREATE INDEX student_profiles_branch_idx ON student_profiles (branch);
