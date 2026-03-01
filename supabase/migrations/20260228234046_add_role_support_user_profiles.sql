/*
  # Update User Profiles Role Support

  1. Changes to `user_profiles` table
    - Update `role` column constraint to support: OWNER, ADMIN, MANAGER, ACCOUNTANT, FINANCE
    - Change default value from 'Manager' to 'MANAGER' (uppercase)
    - Migrate existing role values to uppercase equivalents
  
  2. Data Migration
    - Convert existing 'Manager' → 'MANAGER'
    - Convert existing 'Admin' → 'ADMIN'
    - Convert existing 'Owner' → 'OWNER'
    - Set NULL or empty values to 'MANAGER'
  
  3. Security
    - Maintains existing RLS policies
    - Ensures data integrity with CHECK constraint
*/

-- First, update existing data to uppercase and handle any NULL values
UPDATE user_profiles
SET role = CASE
  WHEN role IS NULL OR role = '' THEN 'MANAGER'
  WHEN UPPER(role) = 'MANAGER' THEN 'MANAGER'
  WHEN UPPER(role) = 'ADMIN' THEN 'ADMIN'
  WHEN UPPER(role) = 'OWNER' THEN 'OWNER'
  ELSE 'MANAGER'
END
WHERE role IS NULL OR role != UPPER(role) OR role NOT IN ('OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'FINANCE');

-- Drop the existing CHECK constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'user_profiles' 
    AND constraint_name LIKE '%role%check%'
  ) THEN
    ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
  END IF;
END $$;

-- Add the new CHECK constraint with updated role values
ALTER TABLE user_profiles
ADD CONSTRAINT user_profiles_role_check 
CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'FINANCE'));

-- Update the default value to 'MANAGER' (uppercase)
ALTER TABLE user_profiles
ALTER COLUMN role SET DEFAULT 'MANAGER';

-- Ensure the column is NOT NULL
ALTER TABLE user_profiles
ALTER COLUMN role SET NOT NULL;