-- Allow 'En Stock' as a valid status (used by the Tasación app)
ALTER TABLE carwin_vehicles DROP CONSTRAINT IF EXISTS carwin_vehicles_status_check;
ALTER TABLE carwin_vehicles ADD CONSTRAINT carwin_vehicles_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'sold'::text, 'removed'::text, 'En Stock'::text]));
