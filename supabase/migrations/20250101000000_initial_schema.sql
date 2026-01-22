-- Drone Quote Mapper: Initial schema and RLS
-- Phase 1: Supabase Setup

-- customers: owned by authenticated user
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  phone text,
  address text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);

-- quotes: linked to customer
CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  service_name text,
  area numeric NOT NULL,
  area_unit text NOT NULL DEFAULT 'acres',
  photo_count integer NOT NULL DEFAULT 0,
  base_price numeric NOT NULL,
  area_cost numeric NOT NULL,
  photo_cost numeric NOT NULL,
  total numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'completed')),
  plot_data jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quotes_customer_id ON public.quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status);

-- payments: linked to quote
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  stripe_payment_intent_id text,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_quote_id ON public.payments(quote_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Row Level Security
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- customers: users can only access their own
CREATE POLICY "users_select_own_customers" ON public.customers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users_insert_own_customers" ON public.customers
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own_customers" ON public.customers
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_delete_own_customers" ON public.customers
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- quotes: users can access quotes whose customer they own
CREATE POLICY "users_select_own_quotes" ON public.quotes
  FOR SELECT TO authenticated USING (
    customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
  );

CREATE POLICY "users_insert_own_quotes" ON public.quotes
  FOR INSERT TO authenticated WITH CHECK (
    customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
  );

CREATE POLICY "users_update_own_quotes" ON public.quotes
  FOR UPDATE TO authenticated USING (
    customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
  ) WITH CHECK (
    customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
  );

CREATE POLICY "users_delete_own_quotes" ON public.quotes
  FOR DELETE TO authenticated USING (
    customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
  );

-- payments: users can read payments for their quotes
CREATE POLICY "users_select_own_payments" ON public.payments
  FOR SELECT TO authenticated USING (
    quote_id IN (
      SELECT q.id FROM public.quotes q
      JOIN public.customers c ON q.customer_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );
-- INSERT/UPDATE for payments done via Edge Function (service role)
