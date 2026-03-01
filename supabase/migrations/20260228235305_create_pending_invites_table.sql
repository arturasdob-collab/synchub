/*
  # Create Pending Invites Table

  1. New Tables
    - `pending_invites`
      - `id` (uuid, primary key)
      - `email` (text, unique, not null) - Email address of invited user
      - `role` (text, not null) - Role to assign when user accepts
      - `invited_by` (uuid, foreign key to user_profiles) - Admin who sent invite
      - `created_at` (timestamptz, default now())
      - `expires_at` (timestamptz) - Optional expiration date
  
  2. Security
    - Enable RLS on `pending_invites` table
    - OWNER/ADMIN can view all pending invites
    - OWNER/ADMIN can insert pending invites
    - OWNER/ADMIN can delete pending invites (e.g., to cancel)
  
  3. Notes
    - When a user signs up and profile is created, check pending_invites by email
    - If found, assign the role from the invite and delete the invite record
    - This table tracks invites before the user accepts and creates their account
*/

-- Create pending_invites table
CREATE TABLE IF NOT EXISTS pending_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  role text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'FINANCE')),
  invited_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz DEFAULT (now() + interval '7 days')
);

-- Enable RLS
ALTER TABLE pending_invites ENABLE ROW LEVEL SECURITY;

-- OWNER/ADMIN can view all pending invites
CREATE POLICY "OWNER and ADMIN can view all pending invites"
  ON pending_invites
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('OWNER', 'ADMIN')
    )
  );

-- OWNER/ADMIN can insert pending invites
CREATE POLICY "OWNER and ADMIN can insert pending invites"
  ON pending_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('OWNER', 'ADMIN')
    )
  );

-- OWNER/ADMIN can delete pending invites
CREATE POLICY "OWNER and ADMIN can delete pending invites"
  ON pending_invites
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('OWNER', 'ADMIN')
    )
  );

-- Create index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_pending_invites_email ON pending_invites(email);

-- Create index for expiration cleanup
CREATE INDEX IF NOT EXISTS idx_pending_invites_expires_at ON pending_invites(expires_at);