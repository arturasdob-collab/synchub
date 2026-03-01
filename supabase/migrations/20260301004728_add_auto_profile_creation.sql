/*
  # Add Automatic Profile Creation on Signup

  1. Changes
    - Create trigger function to automatically create user profiles when new users sign up
    - Create trigger on auth.users table to call the function
    - First user gets OWNER role, subsequent users get MANAGER role by default
  
  2. Security
    - Function runs with SECURITY DEFINER to have necessary permissions
    - Maintains existing RLS policies on user_profiles table
*/

-- Create function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
  assigned_role TEXT;
BEGIN
  -- Count existing users
  SELECT COUNT(*) INTO user_count FROM user_profiles;
  
  -- First user becomes OWNER, others get MANAGER
  IF user_count = 0 THEN
    assigned_role := 'OWNER';
  ELSE
    assigned_role := 'MANAGER';
  END IF;
  
  -- Check if there's a pending invite for this email
  SELECT role INTO assigned_role
  FROM pending_invites
  WHERE email = NEW.email
  AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;
  
  -- If no invite found, use default logic
  IF assigned_role IS NULL THEN
    SELECT COUNT(*) INTO user_count FROM user_profiles;
    IF user_count = 0 THEN
      assigned_role := 'OWNER';
    ELSE
      assigned_role := 'MANAGER';
    END IF;
  END IF;
  
  -- Create the user profile
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    assigned_role
  );
  
  -- Delete the invite if it exists
  DELETE FROM pending_invites WHERE email = NEW.email;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
