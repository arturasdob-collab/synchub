/*
  # Add User Disabled Column

  1. Changes
    - Add `disabled` column to `user_profiles` table (boolean, default false, not null)
    - This column allows OWNER/ADMIN to disable user accounts
  
  2. Security
    - Update RLS policies to allow OWNER/ADMIN to update disabled status
    - Regular users cannot change their own disabled or role columns
    - Disabled users will be prevented from accessing the app at the application level
*/

-- Add disabled column to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'disabled'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN disabled boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Drop and recreate the "Users can update own profile" policy with proper restrictions
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM user_profiles WHERE id = auth.uid())
    AND disabled = (SELECT disabled FROM user_profiles WHERE id = auth.uid())
  );