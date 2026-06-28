CREATE TABLE IF NOT EXISTS public.appointments_archive (
  LIKE public.appointments INCLUDING ALL
);

ALTER TABLE public.appointments_archive
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.appointments_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated appointment archive access"
  ON public.appointments_archive;
CREATE POLICY "Allow authenticated appointment archive access"
ON public.appointments_archive
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

REVOKE ALL ON TABLE public.appointments_archive FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.appointments_archive
  TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_old_appointments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  archived_count integer;
BEGIN
  WITH archived AS (
    INSERT INTO public.appointments_archive (
      id,
      created_at,
      name,
      phone,
      service,
      service_id,
      operator_id,
      date,
      time,
      notes,
      status,
      archived_at
    )
    SELECT
      id,
      created_at,
      name,
      phone,
      service,
      service_id,
      operator_id,
      date,
      time,
      notes,
      status,
      now()
    FROM public.appointments
    WHERE date < current_date - 20
    ON CONFLICT (id) DO UPDATE SET
      created_at = EXCLUDED.created_at,
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      service = EXCLUDED.service,
      service_id = EXCLUDED.service_id,
      operator_id = EXCLUDED.operator_id,
      date = EXCLUDED.date,
      time = EXCLUDED.time,
      notes = EXCLUDED.notes,
      status = EXCLUDED.status,
      archived_at = EXCLUDED.archived_at
    RETURNING id
  ),
  deleted AS (
    DELETE FROM public.appointments AS appointment
    USING archived
    WHERE appointment.id = archived.id
    RETURNING appointment.id
  )
  SELECT count(*)::integer
  INTO archived_count
  FROM deleted;

  RETURN archived_count;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_old_appointments() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_old_appointments() FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_old_appointments()
  TO authenticated;
