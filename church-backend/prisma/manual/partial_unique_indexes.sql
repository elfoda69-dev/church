-- Apply once after the migration that creates child_enrollments / user_roles
-- (or paste into a --create-only migration). These back up the app-level
-- checks in ChildrenService / UsersService with a hard DB constraint.

-- Exactly one open enrollment (end_date IS NULL) per child.
CREATE UNIQUE INDEX IF NOT EXISTS child_enrollments_one_open_per_child
  ON child_enrollments (child_id)
  WHERE end_date IS NULL;

-- Exactly one active General Service Secretary at a time.
-- (A plain partial unique index can't reference roles.key, so this is a trigger.)
CREATE OR REPLACE FUNCTION user_roles_enforce_single_general_secretary() RETURNS trigger AS $$
BEGIN
  IF NEW.valid_to IS NULL AND NEW.role_id = (SELECT id FROM roles WHERE key = 'general_secretary') THEN
    IF EXISTS (
      SELECT 1 FROM user_roles
      WHERE role_id = NEW.role_id AND valid_to IS NULL AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'Only one active General Service Secretary is allowed at a time';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_roles_single_general_secretary
BEFORE INSERT OR UPDATE ON user_roles
FOR EACH ROW EXECUTE FUNCTION user_roles_enforce_single_general_secretary();

