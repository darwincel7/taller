-- Add vendor column to floating_expenses
ALTER TABLE public.floating_expenses ADD COLUMN IF NOT EXISTS vendor text;
