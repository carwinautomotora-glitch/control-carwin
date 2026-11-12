/*
# Create editable balance module

1. New tables
- `carwin_balance_months`: one row per accounting month, with the month label and active/closed status.
- `carwin_balance_category_amounts`: editable monthly amount for each balance category.
- `carwin_balance_metrics`: editable monthly executive indicators for stock, partner balance, expenses, and income.
- `carwin_balance_pending_items`: editable action items with amount, account reference, and pending/completed status.

2. Seed data
- Creates July, August, and September 2026 month rows.
- Copies the existing ledger category totals into the monthly category table without changing the original ledger.
- Copies the current September indicators and pending account balances into the editable module.

3. Security
- Enables RLS on all new tables.
- Grants CRUD access to anon and authenticated because CARWIN has no sign-in screen and is a single-tenant application.
- Adds separate SELECT, INSERT, UPDATE, and DELETE policies for every table.

4. Safety notes
- Existing balance, ledger, vehicle, sale, and expense rows are not deleted or altered.
- All seed inserts are idempotent and can be safely re-run.
*/

CREATE TABLE IF NOT EXISTS carwin_balance_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_start date NOT NULL UNIQUE,
  month_label text NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carwin_balance_category_amounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_start date NOT NULL REFERENCES carwin_balance_months(month_start) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('vehiculos', 'activo_fijo', 'honorarios', 'comisiones', 'arriendos', 'garantias', 'tramites', 'fondos_rendir', 'traspasos', 'depositos', 'proveedores', 'operacion', 'capital')),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(month_start, category)
);

CREATE TABLE IF NOT EXISTS carwin_balance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_start date NOT NULL REFERENCES carwin_balance_months(month_start) ON DELETE RESTRICT,
  metric_key text NOT NULL CHECK (metric_key IN ('stock_value', 'partner_debt', 'total_expense', 'total_income')),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(month_start, metric_key)
);

CREATE TABLE IF NOT EXISTS carwin_balance_pending_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_start date NOT NULL REFERENCES carwin_balance_months(month_start) ON DELETE RESTRICT,
  account_code text,
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carwin_balance_category_month ON carwin_balance_category_amounts(month_start);
CREATE INDEX IF NOT EXISTS idx_carwin_balance_metrics_month ON carwin_balance_metrics(month_start);
CREATE INDEX IF NOT EXISTS idx_carwin_balance_pending_month ON carwin_balance_pending_items(month_start);

ALTER TABLE carwin_balance_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE carwin_balance_category_amounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE carwin_balance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE carwin_balance_pending_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON carwin_balance_months TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON carwin_balance_category_amounts TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON carwin_balance_metrics TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON carwin_balance_pending_items TO anon, authenticated;

DROP POLICY IF EXISTS "shared_read_balance_months" ON carwin_balance_months;
CREATE POLICY "shared_read_balance_months" ON carwin_balance_months FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_balance_months" ON carwin_balance_months;
CREATE POLICY "shared_insert_balance_months" ON carwin_balance_months FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_balance_months" ON carwin_balance_months;
CREATE POLICY "shared_update_balance_months" ON carwin_balance_months FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_balance_months" ON carwin_balance_months;
CREATE POLICY "shared_delete_balance_months" ON carwin_balance_months FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shared_read_balance_category_amounts" ON carwin_balance_category_amounts;
CREATE POLICY "shared_read_balance_category_amounts" ON carwin_balance_category_amounts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_balance_category_amounts" ON carwin_balance_category_amounts;
CREATE POLICY "shared_insert_balance_category_amounts" ON carwin_balance_category_amounts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_balance_category_amounts" ON carwin_balance_category_amounts;
CREATE POLICY "shared_update_balance_category_amounts" ON carwin_balance_category_amounts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_balance_category_amounts" ON carwin_balance_category_amounts;
CREATE POLICY "shared_delete_balance_category_amounts" ON carwin_balance_category_amounts FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shared_read_balance_metrics" ON carwin_balance_metrics;
CREATE POLICY "shared_read_balance_metrics" ON carwin_balance_metrics FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_balance_metrics" ON carwin_balance_metrics;
CREATE POLICY "shared_insert_balance_metrics" ON carwin_balance_metrics FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_balance_metrics" ON carwin_balance_metrics;
CREATE POLICY "shared_update_balance_metrics" ON carwin_balance_metrics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_balance_metrics" ON carwin_balance_metrics;
CREATE POLICY "shared_delete_balance_metrics" ON carwin_balance_metrics FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shared_read_balance_pending_items" ON carwin_balance_pending_items;
CREATE POLICY "shared_read_balance_pending_items" ON carwin_balance_pending_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_balance_pending_items" ON carwin_balance_pending_items;
CREATE POLICY "shared_insert_balance_pending_items" ON carwin_balance_pending_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_balance_pending_items" ON carwin_balance_pending_items;
CREATE POLICY "shared_update_balance_pending_items" ON carwin_balance_pending_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_balance_pending_items" ON carwin_balance_pending_items;
CREATE POLICY "shared_delete_balance_pending_items" ON carwin_balance_pending_items FOR DELETE TO anon, authenticated USING (true);

INSERT INTO carwin_balance_months (month_start, month_label)
VALUES ('2026-07-01', 'Julio 2026'), ('2026-08-01', 'Agosto 2026'), ('2026-09-01', 'Septiembre 2026')
ON CONFLICT (month_start) DO NOTHING;

INSERT INTO carwin_balance_category_amounts (month_start, category, amount)
SELECT date_trunc('month', entry_date)::date, category, sum(amount)
FROM carwin_ledger_entries
WHERE entry_date < '2026-10-01'
GROUP BY date_trunc('month', entry_date)::date, category
ON CONFLICT (month_start, category) DO NOTHING;

INSERT INTO carwin_balance_metrics (month_start, metric_key, amount)
SELECT '2026-09-01', 'stock_value', COALESCE((SELECT asset FROM carwin_balance_accounts WHERE account_code = '1108001' AND as_of = '2026-09-30'), 0)
WHERE NOT EXISTS (SELECT 1 FROM carwin_balance_metrics WHERE month_start = '2026-09-01' AND metric_key = 'stock_value');
INSERT INTO carwin_balance_metrics (month_start, metric_key, amount)
SELECT '2026-09-01', 'partner_debt', COALESCE((SELECT liability FROM carwin_balance_accounts WHERE account_code = '2106009' AND as_of = '2026-09-30'), 0)
WHERE NOT EXISTS (SELECT 1 FROM carwin_balance_metrics WHERE month_start = '2026-09-01' AND metric_key = 'partner_debt');
INSERT INTO carwin_balance_metrics (month_start, metric_key, amount)
SELECT '2026-09-01', 'total_expense', COALESCE((SELECT sum(expense) FROM carwin_balance_accounts WHERE as_of = '2026-09-30'), 0)
WHERE NOT EXISTS (SELECT 1 FROM carwin_balance_metrics WHERE month_start = '2026-09-01' AND metric_key = 'total_expense');
INSERT INTO carwin_balance_metrics (month_start, metric_key, amount)
SELECT '2026-09-01', 'total_income', COALESCE((SELECT sum(income) FROM carwin_balance_accounts WHERE as_of = '2026-09-30'), 0)
WHERE NOT EXISTS (SELECT 1 FROM carwin_balance_metrics WHERE month_start = '2026-09-01' AND metric_key = 'total_income');

INSERT INTO carwin_balance_pending_items (month_start, account_code, title, detail, amount)
SELECT '2026-09-01', seed.account_code, seed.title, seed.detail, COALESCE(account.asset + account.liability, 0)
FROM (VALUES
  ('1108001', 'Vender el stock', 'Los autos parados inmovilizan capital cada mes.'),
  ('2106009', 'Ordenar la cuenta con el socio', 'Definir cómo se devuelve o se convierte en capital.'),
  ('2110005', 'Confirmar comisiones pendientes', 'Provisiones registradas que aún no se pagan.'),
  ('2106001', 'Pagar proveedores', 'Facturas por pagar a proveedores.'),
  ('2106003', 'Pagar honorarios pendientes', 'Honorarios devengados y no pagados.'),
  ('2111040', 'Pagar impuestos', 'Cumplir antes del vencimiento.'),
  ('1106004', 'Rendir anticipos a proveedores', 'Cerrar cada anticipo con factura o recuperarlo.'),
  ('1106005', 'Rendir anticipos de honorarios', 'Descontar contra los honorarios del mes.'),
  ('1101002', 'Rendir fondos entregados', 'Presentar comprobantes de los fondos por rendir.'),
  ('1104003', 'Recuperar garantías', 'Se recuperan al término de los contratos de bodega.'),
  ('1109030', 'Usar el remanente de IVA', 'Se aplica contra el IVA a pagar de los próximos meses.')
) AS seed(account_code, title, detail)
LEFT JOIN carwin_balance_accounts account ON account.account_code = seed.account_code AND account.as_of = '2026-09-30'
WHERE COALESCE(account.asset + account.liability, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM carwin_balance_pending_items existing
    WHERE existing.month_start = '2026-09-01' AND existing.account_code = seed.account_code
  );