/*
# Add reversible sale status

1. Modified table
- `carwin_sales.status`: stores whether a sale is `completed` or `cancelled`.

2. Business behavior
- A sold vehicle can be returned to active stock when a deal falls through.
- The original sale and its amounts remain in the database as history.
- Cancelled sales are excluded from monthly completed-sale utility totals.

3. Security
- Existing RLS, grants, and shared single-tenant policies remain unchanged.
*/

ALTER TABLE public.carwin_sales
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed'
CHECK (status IN ('completed', 'cancelled'));