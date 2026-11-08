/*
# Track net utility per sale

1. Modified table
- `carwin_sales`: add `parking_charged` to preserve whether daily parking was charged to the client.

2. Business behavior
- Sales remain recorded with the actual sale price and negotiated client price.
- The application calculates CARWIN's net utility from the vehicle margin and only the expenses assumed by CARWIN.
- This applies equally to owned vehicles and both consignment types.

3. Security
- Keep the existing shared single-tenant CRUD access and RLS policies unchanged.
*/

ALTER TABLE public.carwin_sales
ADD COLUMN IF NOT EXISTS parking_charged boolean NOT NULL DEFAULT false;