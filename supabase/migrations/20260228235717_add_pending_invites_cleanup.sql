/*
  # Add Pending Invites Cleanup Function

  1. New Functions
    - `cleanup_expired_invites()` - Deletes expired pending invites
      - Returns the count of deleted rows
      - Safe to call repeatedly (idempotent)
      - Only deletes rows where expires_at < now()
  
  2. Security
    - Function is SECURITY DEFINER (runs with creator privileges)
    - Only accessible to authenticated users
    - Will be called from server-side API endpoint with admin check
  
  3. Scheduled Cleanup (pg_cron approach)
    - If pg_cron extension is available, schedule daily cleanup at 2 AM
    - Falls back to manual API-based cleanup if pg_cron is not enabled
  
  4. Notes
    - Cleanup is best-effort and safe to run multiple times
    - Returns count of deleted rows for monitoring/logging
    - Expired invites (7+ days old by default) are automatically removed
*/

-- Create cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_invites()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM pending_invites
  WHERE expires_at IS NOT NULL
    AND expires_at < now();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION cleanup_expired_invites() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION cleanup_expired_invites() IS 'Deletes expired pending invites and returns the count of deleted rows';

-- Attempt to enable pg_cron extension and schedule cleanup (will fail gracefully if not available)
DO $$
BEGIN
  -- Try to create pg_cron extension if it doesn't exist
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    
    -- If successful, schedule the cleanup job to run daily at 2 AM UTC
    PERFORM cron.schedule(
      'cleanup-expired-invites',
      '0 2 * * *',
      'SELECT cleanup_expired_invites();'
    );
    
    RAISE NOTICE 'pg_cron extension enabled and cleanup job scheduled';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron not available, will use API-based cleanup fallback';
  END;
END $$;