
-- Add missing columns to expenditures
ALTER TABLE public.expenditures 
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.expenditure_categories(id),
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text;

-- Add missing columns to expenditure_categories
ALTER TABLE public.expenditure_categories 
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;

-- Add missing columns to staff
ALTER TABLE public.staff 
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS salary numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recurring_day integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS hire_date date,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
