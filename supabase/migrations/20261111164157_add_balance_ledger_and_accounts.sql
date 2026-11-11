/*
# Add accounting balance history (ledger + trial balance)

1. New Tables
- `carwin_ledger_entries`: every dated movement from the partner current account (Cta Cte Rodrigo Araya) in the 30-09-2026 balance. Each row has a date, a description, an amount (positive = spent for the company, negative = reduction) and a category used for monthly grouping.
- `carwin_balance_accounts`: the trial balance as of a date (one row per accounting account with asset, liability, expense and income amounts).

2. Seed Data
- Loads all dated movements and the trial balance as of 2026-09-30 from the accounting analysis PDF.
- Seeds are guarded so re-running the migration does not duplicate rows.

3. Security
- Enable RLS on both tables.
- Shared access (no sign-in in this app), matching the other Carwin tables: anon and authenticated can read, insert, update and delete.

4. Notes
- October 2026 is not in the source file; add it later by inserting rows with a new as_of date and entry dates in October.
*/

CREATE TABLE IF NOT EXISTS carwin_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  category text NOT NULL CHECK (category IN ('vehiculos','activo_fijo','honorarios','comisiones','arriendos','garantias','tramites','fondos_rendir','traspasos','depositos','proveedores','operacion','capital')),
  detail text NOT NULL DEFAULT '',
  amount numeric(14,2) NOT NULL,
  source text NOT NULL DEFAULT 'cuenta_socio_2026_09',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carwin_ledger_entries_date_idx ON carwin_ledger_entries (entry_date);

CREATE TABLE IF NOT EXISTS carwin_balance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of date NOT NULL,
  account_code text NOT NULL,
  account_name text NOT NULL,
  asset numeric(14,2) NOT NULL DEFAULT 0,
  liability numeric(14,2) NOT NULL DEFAULT 0,
  expense numeric(14,2) NOT NULL DEFAULT 0,
  income numeric(14,2) NOT NULL DEFAULT 0,
  UNIQUE (as_of, account_code)
);

ALTER TABLE carwin_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE carwin_balance_accounts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON carwin_ledger_entries TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON carwin_balance_accounts TO anon, authenticated;

DROP POLICY IF EXISTS "shared_read_ledger_entries" ON carwin_ledger_entries;
CREATE POLICY "shared_read_ledger_entries" ON carwin_ledger_entries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_ledger_entries" ON carwin_ledger_entries;
CREATE POLICY "shared_insert_ledger_entries" ON carwin_ledger_entries FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_ledger_entries" ON carwin_ledger_entries;
CREATE POLICY "shared_update_ledger_entries" ON carwin_ledger_entries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_ledger_entries" ON carwin_ledger_entries;
CREATE POLICY "shared_delete_ledger_entries" ON carwin_ledger_entries FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shared_read_balance_accounts" ON carwin_balance_accounts;
CREATE POLICY "shared_read_balance_accounts" ON carwin_balance_accounts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_balance_accounts" ON carwin_balance_accounts;
CREATE POLICY "shared_insert_balance_accounts" ON carwin_balance_accounts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_balance_accounts" ON carwin_balance_accounts;
CREATE POLICY "shared_update_balance_accounts" ON carwin_balance_accounts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_balance_accounts" ON carwin_balance_accounts;
CREATE POLICY "shared_delete_balance_accounts" ON carwin_balance_accounts FOR DELETE TO anon, authenticated USING (true);

INSERT INTO carwin_ledger_entries (entry_date, category, detail, amount)
SELECT v.entry_date::date, v.category, v.detail, v.amount
FROM (VALUES
  ('2026-07-15', 'tramites', 'Depósito inscripción dominio', 19980),
  ('2026-07-23', 'tramites', 'Pago inicial UF 2,5 abogado escritura', 102112),
  ('2026-07-23', 'arriendos', 'Arriendo bodegas 22 y 23', 195790),
  ('2026-07-24', 'garantias', 'Pago garantía bodega 23', 472095),
  ('2026-07-24', 'garantias', 'Pago garantía bodega 22', 446337),
  ('2026-07-24', 'activo_fijo', 'Compra materiales oficina', 1000000),
  ('2026-07-28', 'activo_fijo', 'Anticipo maestro oficinas', 500000),
  ('2026-07-30', 'activo_fijo', 'Compra iluminación y mesas', 336000),
  ('2026-08-06', 'activo_fijo', 'Compra materiales oficina', 145000),
  ('2026-08-07', 'capital', 'Asiento capital 8.550 acciones x $1.000', -8550000),
  ('2026-08-07', 'activo_fijo', 'Compra mobiliario oficina', 2000000),
  ('2026-08-07', 'activo_fijo', 'Compra mobiliario oficina y otros', 1080424),
  ('2026-08-07', 'activo_fijo', 'Pago saldo maestro oficina', 540000),
  ('2026-08-07', 'activo_fijo', 'Adicional maestro oficina', 175000),
  ('2026-08-14', 'activo_fijo', 'Pago diferencia compras', 230627),
  ('2026-08-20', 'activo_fijo', 'Pago letrero luminoso', 369673),
  ('2026-08-20', 'activo_fijo', 'Compra scanner y partidor', 1542000),
  ('2026-08-20', 'operacion', 'Compra insumos cafetería y tazones', 9070),
  ('2026-08-20', 'tramites', 'Pago notaría y CBRS', 208548),
  ('2026-08-21', 'arriendos', 'Arriendo bodegas 22 y 23', 651312),
  ('2026-08-25', 'honorarios', 'Anticipo honorarios Luis Valenzuela', 200000),
  ('2026-08-25', 'honorarios', 'Anticipo honorarios Rodrigo Guerrero', 200000),
  ('2026-08-25', 'honorarios', 'Anticipo honorarios Juan C. Santander', 200000),
  ('2026-08-25', 'operacion', 'Compras varias', 58720),
  ('2026-08-25', 'arriendos', 'Pago arriendo 1 estacionamiento', 31400),
  ('2026-08-27', 'proveedores', 'Pago Chileautos y otros', 237802),
  ('2026-08-28', 'vehiculos', 'Pago compra Silverado y Jeep', 18865484),
  ('2026-08-28', 'vehiculos', 'Pago compra Silverado y Jeep', 27359516),
  ('2026-08-28', 'comisiones', 'Pago comisión de compra Silverado y Jeep', 2800000),
  ('2026-08-31', 'honorarios', 'Pago honorario Rodrigo Guerrero', 678000),
  ('2026-08-31', 'honorarios', 'Pago honorario Juan C. Santander', 508500),
  ('2026-08-31', 'honorarios', 'Pago honorario Luis Valenzuela', 678000),
  ('2026-09-01', 'fondos_rendir', 'Fondos por rendir gastos Silverado', 45000),
  ('2026-09-03', 'fondos_rendir', 'Fondos por rendir Luis', 416500),
  ('2026-09-03', 'fondos_rendir', 'Fondos por rendir Luis', 380800),
  ('2026-09-04', 'fondos_rendir', 'Fondos por rendir Luis', 1575462),
  ('2026-09-04', 'vehiculos', 'Fondos por rendir Luis (compra Lexus)', 11800000),
  ('2026-09-04', 'fondos_rendir', 'Fondos por rendir Luis', 300000),
  ('2026-09-04', 'fondos_rendir', 'Fondos por rendir Luis', 13800),
  ('2026-09-04', 'fondos_rendir', 'Fondos por rendir Luis', 340372),
  ('2026-09-07', 'fondos_rendir', 'Fondos por rendir Luis', 321000),
  ('2026-09-08', 'fondos_rendir', 'Fondo por rendir Luis', 300000),
  ('2026-09-08', 'fondos_rendir', 'Fondo por rendir Luis', 119000),
  ('2026-09-08', 'fondos_rendir', 'Fondo por rendir Luis', 555000),
  ('2026-09-08', 'fondos_rendir', 'Fondo por rendir Luis', 119000),
  ('2026-09-08', 'fondos_rendir', 'Fondos por rendir Luis', 38328),
  ('2026-09-09', 'depositos', 'Depósito doc ATM', 300000),
  ('2026-09-09', 'vehiculos', 'Fondos por rendir Luis (compra vehículo)', 7800000),
  ('2026-09-17', 'traspasos', 'Traspaso Rodrigo Araya', 290000),
  ('2026-09-17', 'fondos_rendir', 'Fondo por rendir Luis', 651878),
  ('2026-09-21', 'fondos_rendir', 'Fondos por rendir Luis', 147215),
  ('2026-09-24', 'traspasos', 'Traspaso Rodrigo Araya', 500000),
  ('2026-09-29', 'traspasos', 'Traspaso Rodrigo Araya', 500000),
  ('2026-09-30', 'traspasos', 'Traspaso Rodrigo Araya', 2000000)
) AS v(entry_date, category, detail, amount)
WHERE NOT EXISTS (SELECT 1 FROM carwin_ledger_entries WHERE source = 'cuenta_socio_2026_09');

INSERT INTO carwin_balance_accounts (as_of, account_code, account_name, asset, liability, expense, income) VALUES
  ('2026-09-30', '1101002', 'Fondos por rendir', 0, 43607, 0, 0),
  ('2026-09-30', '1101020', 'Banco Santander', 344396, 0, 0, 0),
  ('2026-09-30', '1104001', 'Clientes', 3000, 0, 0, 0),
  ('2026-09-30', '1104003', 'Boletas en garantía', 918432, 0, 0, 0),
  ('2026-09-30', '1106004', 'Anticipo de proveedores', 3547996, 0, 0, 0),
  ('2026-09-30', '1106005', 'Anticipo a honorarios', 600000, 0, 0, 0),
  ('2026-09-30', '1106010', 'Cta cte Paz Valenzuela', 450000, 0, 0, 0),
  ('2026-09-30', '1108001', 'Vehículos', 65825000, 0, 0, 0),
  ('2026-09-30', '1109002', 'Pagos provisionales mensuales', 3, 0, 0, 0),
  ('2026-09-30', '1109030', 'Remanente crédito fiscal', 1076249, 0, 0, 0),
  ('2026-09-30', '1204001', 'Maquinarias y equipos', 1618496, 0, 0, 0),
  ('2026-09-30', '1204006', 'Equipos de oficina', 2407850, 0, 0, 0),
  ('2026-09-30', '1204203', 'Depreciación acumulada maquinarias', -69676, 0, 0, 0),
  ('2026-09-30', '1204206', 'Depreciación acumulada equipos de oficina', -22153, 0, 0, 0),
  ('2026-09-30', '2106001', 'Proveedores', 0, 215183, 0, 0),
  ('2026-09-30', '2106003', 'Honorarios por pagar', 0, 80000, 0, 0),
  ('2026-09-30', '2106009', 'Cta cte socio Rodrigo Araya', 0, 81804745, 0, 0),
  ('2026-09-30', '2110005', 'Provisiones varias', 0, 4011799, 0, 0),
  ('2026-09-30', '2111040', 'Impuestos por pagar', 0, 320253, 0, 0),
  ('2026-09-30', '3101001', 'Capital social', 0, 9000000, 0, 0),
  ('2026-09-30', '4101001', 'Ventas', 0, 0, 0, 2521),
  ('2026-09-30', '5103006', 'Gastos de reparación oficina', 0, 0, 2560775, 0),
  ('2026-09-30', '5104030', 'Honorarios', 0, 0, 4380000, 0),
  ('2026-09-30', '5106001', 'Servicios contables', 0, 0, 179108, 0),
  ('2026-09-30', '5106007', 'Servicios legales', 0, 0, 310660, 0),
  ('2026-09-30', '5107004', 'Suscripciones', 0, 0, 429132, 0),
  ('2026-09-30', '5107010', 'Gastos por comisión', 0, 0, 4011799, 0),
  ('2026-09-30', '5107011', 'Arriendo de oficina', 0, 0, 547797, 0),
  ('2026-09-30', '5107013', 'Gastos notariales', 0, 0, 1500, 0),
  ('2026-09-30', '5107015', 'Transportes y traslados', 0, 0, 104133, 0),
  ('2026-09-30', '5107019', 'Útiles y gastos de oficina', 0, 0, 574436, 0),
  ('2026-09-30', '5107024', 'Gastos generales', 0, 0, 96453, 0),
  ('2026-09-30', '5107026', 'Fletes externos', 0, 0, 141730, 0),
  ('2026-09-30', '5107031', 'Gastos comunes', 0, 0, 11100, 0),
  ('2026-09-30', '5204001', 'Combustible', 0, 0, 300492, 0),
  ('2026-09-30', '5204005', 'Peajes', 0, 0, 44550, 0),
  ('2026-09-30', '5204006', 'Estacionamiento', 0, 0, 173581, 0),
  ('2026-09-30', '5204008', 'Mantención y reparación', 0, 0, 3536946, 0),
  ('2026-09-30', '5206001', 'Depreciación del ejercicio', 0, 0, 91829, 0),
  ('2026-09-30', '5207003', 'Alojamiento', 0, 0, 44500, 0),
  ('2026-09-30', '5207004', 'Alimentación', 0, 0, 105920, 0),
  ('2026-09-30', '5207005', 'Pasajes', 0, 0, 22660, 0),
  ('2026-09-30', '5207006', 'Arriendo de estacionamiento', 0, 0, 1109414, 0)
ON CONFLICT (as_of, account_code) DO NOTHING;
