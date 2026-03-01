/*
  # Add User Management Safety Guards

  1. New Functions
    - `is_owner()` - Helper to check if current user is OWNER
    - `count_owners()` - Returns the count of active OWNER users
    - `can_modify_user(target_user_id, new_role, new_disabled)` - Validates if current user can modify target user
    - Trigger function to enforce safety rules on updates
  
  2. Safety Rules Enforced
    - ADMIN can only modify non-admin roles (MANAGER, ACCOUNTANT, FINANCE)
    - Only OWNER can modify ADMIN and OWNER roles
    - Cannot disable any OWNER
    - Cannot disable yourself
    - Must maintain at least one active OWNER
    - Cannot demote the last OWNER
  
  3. Security
    - Functions run with SECURITY DEFINER for proper permission checks
    - Trigger enforces rules at database level (cannot be bypassed)
    - Updated RLS policies to enforce role-based modifications
  
  4. Notes
    - Backend enforcement ensures security even if frontend is bypassed
    - Clear error messages for each violation
    - All changes are atomic and consistent
*/

-- Helper function to check if current user is OWNER
CREATE OR REPLACE FUNCTION is_owner()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'OWNER'
  );
$$;

-- Function to count active OWNER users
CREATE OR REPLACE FUNCTION count_owners()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM user_profiles
  WHERE role = 'OWNER'
  AND (disabled IS NULL OR disabled = false);
$$;

-- Function to check if a user can modify another user
CREATE OR REPLACE FUNCTION can_modify_user(
  target_user_id UUID,
  target_old_role TEXT DEFAULT NULL,
  target_new_role TEXT DEFAULT NULL,
  target_new_disabled BOOLEAN DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_role TEXT;
  target_current_role TEXT;
  target_current_disabled BOOLEAN;
  owner_count INTEGER;
  final_role TEXT;
  final_disabled BOOLEAN;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role
  FROM user_profiles
  WHERE id = auth.uid();
  
  IF current_user_role IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get target user's current state
  SELECT role, COALESCE(disabled, false)
  INTO target_current_role, target_current_disabled
  FROM user_profiles
  WHERE id = target_user_id;
  
  IF target_current_role IS NULL THEN
    RETURN false;
  END IF;
  
  -- Determine final values
  final_role := COALESCE(target_new_role, target_current_role);
  final_disabled := COALESCE(target_new_disabled, target_current_disabled);
  
  -- Rule 1: Cannot modify yourself
  IF auth.uid() = target_user_id THEN
    IF final_role != target_current_role OR final_disabled != target_current_disabled THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Rule 2: Cannot disable any OWNER
  IF final_disabled = true AND (target_current_role = 'OWNER' OR final_role = 'OWNER') THEN
    RETURN false;
  END IF;
  
  -- Rule 3: Must maintain at least one active OWNER
  IF target_current_role = 'OWNER' AND final_role != 'OWNER' THEN
    SELECT count_owners() INTO owner_count;
    IF owner_count <= 1 THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Rule 4: Only OWNER can modify ADMIN and OWNER roles
  IF current_user_role != 'OWNER' THEN
    IF target_current_role IN ('OWNER', 'ADMIN') OR final_role IN ('OWNER', 'ADMIN') THEN
      RETURN false;
    END IF;
  END IF;
  
  RETURN true;
END;
$$;

-- Trigger function to enforce safety rules
CREATE OR REPLACE FUNCTION enforce_user_modification_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_role TEXT;
  owner_count INTEGER;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role
  FROM user_profiles
  WHERE id = auth.uid();
  
  -- Rule 1: Cannot disable yourself
  IF NEW.id = auth.uid() AND NEW.disabled = true AND (OLD.disabled IS NULL OR OLD.disabled = false) THEN
    RAISE EXCEPTION 'You cannot disable your own account';
  END IF;
  
  -- Rule 2: Cannot modify your own role
  IF NEW.id = auth.uid() AND NEW.role != OLD.role THEN
    RAISE EXCEPTION 'You cannot modify your own role';
  END IF;
  
  -- Rule 3: Cannot disable any OWNER
  IF NEW.disabled = true AND NEW.role = 'OWNER' THEN
    RAISE EXCEPTION 'Cannot disable OWNER accounts';
  END IF;
  
  IF NEW.disabled = true AND OLD.role = 'OWNER' THEN
    RAISE EXCEPTION 'Cannot disable OWNER accounts';
  END IF;
  
  -- Rule 4: Must maintain at least one active OWNER
  IF OLD.role = 'OWNER' AND NEW.role != 'OWNER' THEN
    SELECT count_owners() INTO owner_count;
    IF owner_count <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the last OWNER. At least one OWNER must remain.';
    END IF;
  END IF;
  
  -- Rule 5: Only OWNER can modify ADMIN and OWNER roles
  IF current_user_role != 'OWNER' THEN
    IF OLD.role IN ('OWNER', 'ADMIN') OR NEW.role IN ('OWNER', 'ADMIN') THEN
      RAISE EXCEPTION 'Only OWNER can modify ADMIN and OWNER roles';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS enforce_user_modification_rules_trigger ON user_profiles;

CREATE TRIGGER enforce_user_modification_rules_trigger
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role OR OLD.disabled IS DISTINCT FROM NEW.disabled)
  EXECUTE FUNCTION enforce_user_modification_rules();

-- Update RLS policy for updates to use the new safety function
DROP POLICY IF EXISTS "Admins can update user roles and status" ON user_profiles;

CREATE POLICY "Admins can update user roles and status"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.role IN ('OWNER', 'ADMIN')
    )
  )
  WITH CHECK (
    can_modify_user(
      id,
      (SELECT role FROM user_profiles WHERE id = user_profiles.id),
      role,
      disabled
    )
  );

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION count_owners() TO authenticated;
GRANT EXECUTE ON FUNCTION can_modify_user(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION is_owner() IS 'Returns true if the current user has OWNER role';
COMMENT ON FUNCTION count_owners() IS 'Returns the count of active OWNER users';
COMMENT ON FUNCTION can_modify_user(UUID, TEXT, TEXT, BOOLEAN) IS 'Validates if current user can modify target user based on safety rules';
COMMENT ON FUNCTION enforce_user_modification_rules() IS 'Trigger function that enforces user modification safety rules';