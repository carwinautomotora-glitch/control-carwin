/* Reset existing wash/polish expenses to 0 so the operator controls the amount per vehicle. */
UPDATE public.carwin_vehicle_expenses
SET amount = 0
WHERE expense_type = 'wash';