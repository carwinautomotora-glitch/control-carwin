/*
# Add UF value to operational settings

1. Modified Tables
- `carwin_settings`: new column `uf_value` (numeric, default 47890 CLP), the value of one UF used by the installment simulator to convert the requested amount into UF. Editable from the settings screen.

2. Security
- No policy or grant changes. Existing settings policies already cover the new column.

3. Notes
- Uses IF NOT EXISTS so the migration can be safely re-run.
*/

ALTER TABLE public.carwin_settings
  ADD COLUMN IF NOT EXISTS uf_value numeric(14,2) NOT NULL DEFAULT 47890;
