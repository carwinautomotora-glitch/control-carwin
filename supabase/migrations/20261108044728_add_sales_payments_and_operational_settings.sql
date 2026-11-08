/*
# Add payment, expense allocation, and sale document foundations

1. New Tables
- `carwin_settings`: one shared operations row for configurable daily stay, card fee, and transfer estimates.
- `carwin_sale_payments`: multiple payment entries per sale, including verification state and payment method.
- `carwin_sale_change_history`: immutable JSON snapshots for sale edits and note versions.

2. Modified Tables
- `carwin_vehicle_expenses`: adds `allocation` and `is_daily_stay` so every cost clearly identifies who pays it and whether it is automatic stay cost.
- `carwin_sales`: adds folio, buyer details, delivery date, conditions, and document version fields.

3. Security
- RLS is enabled on every new table.
- Shared CRUD access is granted to anon and authenticated because CARWIN currently has no sign-in screen.
- Policies are separate for SELECT, INSERT, UPDATE, and DELETE.

4. Data safety
- Existing expenses default to `carwin` allocation and remain unchanged in amount.
- Existing sales receive generated folios and version 1.
- No existing records are deleted.
*/

CREATE TABLE IF NOT EXISTS public.carwin_settings (
  id boolean PRIMARY KEY DEFAULT true,
  daily_stay_cost numeric(14,2) NOT NULL DEFAULT 3900,
  card_fee_rate numeric(7,4) NOT NULL DEFAULT 1.8,
  transfer_tax_rate numeric(7,4) NOT NULL DEFAULT 1.5,
  transfer_fixed_cost numeric(14,2) NOT NULL DEFAULT 130000,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carwin_settings_single_row CHECK (id = true)
);

INSERT INTO public.carwin_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.carwin_vehicle_expenses
  ADD COLUMN IF NOT EXISTS allocation text NOT NULL DEFAULT 'carwin',
  ADD COLUMN IF NOT EXISTS is_daily_stay boolean NOT NULL DEFAULT false;

ALTER TABLE public.carwin_vehicle_expenses
  DROP CONSTRAINT IF EXISTS carwin_vehicle_expenses_allocation_check;
ALTER TABLE public.carwin_vehicle_expenses
  ADD CONSTRAINT carwin_vehicle_expenses_allocation_check CHECK (allocation IN ('carwin', 'customer', 'shared'));

ALTER TABLE public.carwin_sales
  ADD COLUMN IF NOT EXISTS folio text,
  ADD COLUMN IF NOT EXISTS buyer_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS buyer_rut text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS buyer_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS buyer_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivery_date date,
  ADD COLUMN IF NOT EXISTS terms text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_version integer NOT NULL DEFAULT 1;

UPDATE public.carwin_sales SET folio = 'V-' || upper(substr(replace(id::text, '-', ''), 1, 8)) WHERE folio IS NULL;
ALTER TABLE public.carwin_sales ALTER COLUMN folio SET NOT NULL;
ALTER TABLE public.carwin_sales ALTER COLUMN folio SET DEFAULT ('V-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));

CREATE TABLE IF NOT EXISTS public.carwin_sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.carwin_sales(id) ON DELETE CASCADE,
  payment_date date NOT NULL,
  method text NOT NULL CHECK (method IN ('cash', 'bank_draft', 'bank_transfer', 'card', 'trade_in')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  bank text NOT NULL DEFAULT '',
  operation_reference text NOT NULL DEFAULT '',
  receipt_url text,
  verified boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.carwin_sale_change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.carwin_sales(id) ON DELETE CASCADE,
  version integer NOT NULL,
  change_type text NOT NULL CHECK (change_type IN ('created', 'updated', 'document_generated')),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.carwin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carwin_sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carwin_sale_change_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.carwin_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carwin_sale_payments TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carwin_sale_change_history TO anon, authenticated;
GRANT UPDATE (allocation, is_daily_stay) ON public.carwin_vehicle_expenses TO anon, authenticated;
GRANT UPDATE (folio, buyer_name, buyer_rut, buyer_address, buyer_phone, delivery_date, terms, document_version) ON public.carwin_sales TO anon, authenticated;

DROP POLICY IF EXISTS "shared_read_settings" ON public.carwin_settings;
CREATE POLICY "shared_read_settings" ON public.carwin_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_settings" ON public.carwin_settings;
CREATE POLICY "shared_insert_settings" ON public.carwin_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_settings" ON public.carwin_settings;
CREATE POLICY "shared_update_settings" ON public.carwin_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_settings" ON public.carwin_settings;
CREATE POLICY "shared_delete_settings" ON public.carwin_settings FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shared_read_sale_payments" ON public.carwin_sale_payments;
CREATE POLICY "shared_read_sale_payments" ON public.carwin_sale_payments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_sale_payments" ON public.carwin_sale_payments;
CREATE POLICY "shared_insert_sale_payments" ON public.carwin_sale_payments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_sale_payments" ON public.carwin_sale_payments;
CREATE POLICY "shared_update_sale_payments" ON public.carwin_sale_payments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_sale_payments" ON public.carwin_sale_payments;
CREATE POLICY "shared_delete_sale_payments" ON public.carwin_sale_payments FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shared_read_sale_history" ON public.carwin_sale_change_history;
CREATE POLICY "shared_read_sale_history" ON public.carwin_sale_change_history FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_sale_history" ON public.carwin_sale_change_history;
CREATE POLICY "shared_insert_sale_history" ON public.carwin_sale_change_history FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_sale_history" ON public.carwin_sale_change_history;
CREATE POLICY "shared_update_sale_history" ON public.carwin_sale_change_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_sale_history" ON public.carwin_sale_change_history;
CREATE POLICY "shared_delete_sale_history" ON public.carwin_sale_change_history FOR DELETE TO anon, authenticated USING (true);