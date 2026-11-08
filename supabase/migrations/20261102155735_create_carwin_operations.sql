/*
# Create CARWIN operations workspace

1. New Tables
- `carwin_vehicles`: vehicle inventory and technical, documentation, pricing, and stock status fields.
- `carwin_vehicle_expenses`: preparation and additional costs attached to a vehicle.
- `carwin_office_expenses`: daily office expenses used by the monthly dashboard.
- `carwin_sales`: completed sale records and WhatsApp liquidation selections.

2. Security
- Enable RLS on all tables.
- Grant CRUD access to anon and authenticated because this is a single-tenant internal workspace without sign-in.
- Add separate read, insert, update, and delete policies using shared access intentionally.

3. Important notes
- Dates and monetary values are stored explicitly so the client can calculate exact daily parking and historical monthly views.
- Seed data is idempotent through stable vehicle ids and conflict-safe inserts.
*/

CREATE TABLE IF NOT EXISTS public.carwin_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model text NOT NULL,
  plate text NOT NULL DEFAULT '',
  kilometers integer NOT NULL DEFAULT 0,
  owners_count integer NOT NULL DEFAULT 1,
  color text NOT NULL,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('own', 'physical_consignment', 'virtual_consignment')),
  purchase_price numeric(14,2) NOT NULL DEFAULT 0,
  sale_price numeric(14,2) NOT NULL DEFAULT 0,
  agreed_price numeric(14,2) NOT NULL DEFAULT 0,
  has_both_keys boolean NOT NULL DEFAULT false,
  maintenance_type text NOT NULL CHECK (maintenance_type IN ('brand', 'private', 'none')),
  permit_expiry date,
  soap_expiry date,
  inspection_expiry date,
  entered_at date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'removed')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.carwin_vehicle_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.carwin_vehicles(id) ON DELETE CASCADE,
  expense_type text NOT NULL CHECK (expense_type IN ('wash', 'extra')),
  description text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  expense_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.carwin_office_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  expense_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.carwin_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.carwin_vehicles(id),
  sold_at date NOT NULL,
  real_sale_price numeric(14,2) NOT NULL,
  agreed_price numeric(14,2) NOT NULL,
  charged_expense_ids uuid[] NOT NULL DEFAULT '{}',
  final_transfer_amount numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.carwin_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carwin_vehicle_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carwin_office_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carwin_sales ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.carwin_vehicles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carwin_vehicle_expenses TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carwin_office_expenses TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carwin_sales TO anon, authenticated;

DROP POLICY IF EXISTS "shared_read_vehicles" ON public.carwin_vehicles;
CREATE POLICY "shared_read_vehicles" ON public.carwin_vehicles FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_vehicles" ON public.carwin_vehicles;
CREATE POLICY "shared_insert_vehicles" ON public.carwin_vehicles FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_vehicles" ON public.carwin_vehicles;
CREATE POLICY "shared_update_vehicles" ON public.carwin_vehicles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_vehicles" ON public.carwin_vehicles;
CREATE POLICY "shared_delete_vehicles" ON public.carwin_vehicles FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shared_read_vehicle_expenses" ON public.carwin_vehicle_expenses;
CREATE POLICY "shared_read_vehicle_expenses" ON public.carwin_vehicle_expenses FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_vehicle_expenses" ON public.carwin_vehicle_expenses;
CREATE POLICY "shared_insert_vehicle_expenses" ON public.carwin_vehicle_expenses FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_vehicle_expenses" ON public.carwin_vehicle_expenses;
CREATE POLICY "shared_update_vehicle_expenses" ON public.carwin_vehicle_expenses FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_vehicle_expenses" ON public.carwin_vehicle_expenses;
CREATE POLICY "shared_delete_vehicle_expenses" ON public.carwin_vehicle_expenses FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shared_read_office_expenses" ON public.carwin_office_expenses;
CREATE POLICY "shared_read_office_expenses" ON public.carwin_office_expenses FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_office_expenses" ON public.carwin_office_expenses;
CREATE POLICY "shared_insert_office_expenses" ON public.carwin_office_expenses FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_office_expenses" ON public.carwin_office_expenses;
CREATE POLICY "shared_update_office_expenses" ON public.carwin_office_expenses FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_office_expenses" ON public.carwin_office_expenses;
CREATE POLICY "shared_delete_office_expenses" ON public.carwin_office_expenses FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shared_read_sales" ON public.carwin_sales;
CREATE POLICY "shared_read_sales" ON public.carwin_sales FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_sales" ON public.carwin_sales;
CREATE POLICY "shared_insert_sales" ON public.carwin_sales FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_sales" ON public.carwin_sales;
CREATE POLICY "shared_update_sales" ON public.carwin_sales FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_sales" ON public.carwin_sales;
CREATE POLICY "shared_delete_sales" ON public.carwin_sales FOR DELETE TO anon, authenticated USING (true);

INSERT INTO public.carwin_vehicles (id, model, plate, kilometers, owners_count, color, vehicle_type, purchase_price, sale_price, agreed_price, has_both_keys, maintenance_type, entered_at, status)
VALUES
('10000000-0000-0000-0000-000000000001','Chevrolet Silverado 6.2 ZR2 2025','',31500,1,'Blanco','own',37300000,47800000,47800000,true,'brand','2026-10-30','active'),
('10000000-0000-0000-0000-000000000002','Lexus CT200 H 1.8 2019','',98500,1,'Gris','own',12100000,16990000,16990000,true,'private','2026-10-30','active'),
('10000000-0000-0000-0000-000000000003','Chevrolet Traverse 3.6L 2016','',109000,1,'Gris','own',8100000,10890000,10890000,false,'private','2026-10-30','active'),
('10000000-0000-0000-0000-000000000004','BMW X2 xDrive 20D 2019','',113200,2,'Dorado','physical_consignment',22290000,22990000,22990000,true,'brand','2026-10-03','active'),
('10000000-0000-0000-0000-000000000005','BMW 420 Gran Coupé 2025','',27525,2,'Blanco','physical_consignment',38190000,38890000,38890000,true,'brand','2026-10-03','active'),
('10000000-0000-0000-0000-000000000006','Suzuki Swift 1.2 GL 2021','',40155,1,'Gris','physical_consignment',9700000,10400000,10400000,true,'private','2026-10-20','active'),
('10000000-0000-0000-0000-000000000007','Chevrolet Tracker 1.2T LTZ 2021','',63200,1,'Blanco','physical_consignment',9790000,10490000,10490000,true,'brand','2026-10-30','active'),
('10000000-0000-0000-0000-000000000008','Honda City EXL 1.5 2024','',29700,2,'Blanco','physical_consignment',14950000,15650000,15650000,false,'private','2026-10-30','active'),
('10000000-0000-0000-0000-000000000009','BMW 128 TI 2024','',20800,2,'Blanco','virtual_consignment',33150000,33850000,33850000,true,'brand','2026-11-01','active'),
('10000000-0000-0000-0000-000000000010','Ford F150 Platinum 2023','',53000,2,'Blanco','virtual_consignment',38700000,39400000,39400000,true,'brand','2026-11-01','active'),
('10000000-0000-0000-0000-000000000011','BMW X5 4.8 I 2007','',131000,3,'Gris','virtual_consignment',10490000,11190000,11190000,false,'private','2026-11-01','active'),
('10000000-0000-0000-0000-000000000012','Mini Cooper F55 2018','',68100,2,'Crema','virtual_consignment',12790000,13490000,13490000,true,'brand','2026-11-01','active'),
('10000000-0000-0000-0000-000000000013','Audi Q3 T 4X4 2019','',22800,2,'Gris','virtual_consignment',21090000,21790000,21790000,true,'brand','2026-11-01','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.carwin_vehicle_expenses (vehicle_id, expense_type, description, amount, expense_date)
SELECT id, 'wash', 'Lavado y pulido inicial', 119000, '2026-11-01'
FROM public.carwin_vehicles
WHERE id IN ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000013')
AND NOT EXISTS (SELECT 1 FROM public.carwin_vehicle_expenses WHERE expense_type = 'wash');