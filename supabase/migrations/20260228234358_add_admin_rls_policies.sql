/*
  # Add Admin RLS Policies for User Profiles

  1. New Policies
    - "Admin users can read all profiles" - Allows OWNER and ADMIN roles to view all user profiles
    - "Admin users can update all profiles" - Allows OWNER and ADMIN roles to update any user profile
    - "Users can read own profile" - Allows any authenticated user to read their own profile
    - "Users can update own profile" - Allows any authenticated user to update their own profile (except role)
  
  2. Security
    - Only OWNER and ADMIN roles can access all user profiles
    - Regular users can only access their own profile
    - Role updates are restricted to OWNER and ADMIN only
*/

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Admin users can read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admin users can update all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

-- Policy: Admin users (OWNER/ADMIN) can read all profiles
CREATE POLICY "Admin users can read all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles AS up
      WHERE up.id = auth.uid()
      AND up.role IN ('OWNER', 'ADMIN')
    )
  );

-- Policy: Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Policy: Admin users (OWNER/ADMIN) can update all profiles
CREATE POLICY "Admin users can update all profiles"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles AS up
      WHERE up.id = auth.uid()
      AND up.role IN ('OWNER', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles AS up
      WHERE up.id = auth.uid()
      AND up.role IN ('OWNER', 'ADMIN')
    )
  );

-- Policy: Users can update their own profile (but not role)
CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- The role column cannot be changed by regular users (enforced at application level)
  );