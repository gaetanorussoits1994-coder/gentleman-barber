CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.operator_services (
  operator_id uuid REFERENCES public.operators(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  PRIMARY KEY (operator_id, service_id)
);

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS operator_id uuid REFERENCES public.operators(id),
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id);

CREATE INDEX IF NOT EXISTS appointments_operator_date_idx
  ON public.appointments (operator_id, date);

CREATE INDEX IF NOT EXISTS operator_services_service_idx
  ON public.operator_services (service_id);

ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public operator reads" ON public.operators;
CREATE POLICY "Allow public operator reads"
ON public.operators
FOR SELECT
TO anon, authenticated
USING (active = true OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow public service reads" ON public.services;
CREATE POLICY "Allow public service reads"
ON public.services
FOR SELECT
TO anon, authenticated
USING (active = true OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow public operator service reads"
  ON public.operator_services;
CREATE POLICY "Allow public operator service reads"
ON public.operator_services
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow authenticated operator writes"
  ON public.operators;
CREATE POLICY "Allow authenticated operator writes"
ON public.operators
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated service writes"
  ON public.services;
CREATE POLICY "Allow authenticated service writes"
ON public.services
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated operator service writes"
  ON public.operator_services;
CREATE POLICY "Allow authenticated operator service writes"
ON public.operator_services
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
