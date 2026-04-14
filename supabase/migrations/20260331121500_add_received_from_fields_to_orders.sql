/*
  # Add received-from fields to orders

  Stores who sent the client order and the contact details as a snapshot.
  These values can be selected from company contacts or entered manually.
*/

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS received_from_name text,
  ADD COLUMN IF NOT EXISTS received_from_contact text;
