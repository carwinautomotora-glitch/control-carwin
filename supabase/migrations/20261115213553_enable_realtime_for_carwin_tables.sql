-- Enable realtime publication for all carwin tables so the app receives
-- INSERT / UPDATE / DELETE events without polling.
ALTER PUBLICATION supabase_realtime ADD TABLE carwin_vehicles;
ALTER PUBLICATION supabase_realtime ADD TABLE carwin_vehicle_expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE carwin_office_expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE carwin_sales;
ALTER PUBLICATION supabase_realtime ADD TABLE carwin_sale_payments;

-- Full row in WAL for change events (needed for realtime payload)
ALTER TABLE carwin_vehicles REPLICA IDENTITY FULL;
ALTER TABLE carwin_vehicle_expenses REPLICA IDENTITY FULL;
ALTER TABLE carwin_office_expenses REPLICA IDENTITY FULL;
ALTER TABLE carwin_sales REPLICA IDENTITY FULL;
ALTER TABLE carwin_sale_payments REPLICA IDENTITY FULL;
