CREATE OR REPLACE FUNCTION public.cron_job_health()
RETURNS TABLE (
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  last_scheduled_run timestamptz,
  last_http_200 timestamptz,
  hours_since_last_http_200 numeric,
  is_stale boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron, net
AS $$
  WITH runs AS (
    SELECT d.jobid,
           max(d.start_time) FILTER (WHERE d.status = 'succeeded') AS last_ok,
           max(NULLIF(regexp_replace(d.return_message, '\D', '', 'g'), '')::bigint)
             FILTER (WHERE d.status = 'succeeded') AS last_request_id
    FROM cron.job_run_details d
    GROUP BY d.jobid
  ),
  ok AS (
    SELECT r.jobid, max(h.created) AS last_200
    FROM cron.job_run_details r
    JOIN net._http_response h
      ON h.id = NULLIF(regexp_replace(r.return_message, '\D', '', 'g'), '')::bigint
    WHERE h.status_code = 200
    GROUP BY r.jobid
  )
  SELECT j.jobid,
         j.jobname::text,
         j.schedule::text,
         j.active,
         runs.last_ok,
         ok.last_200,
         round(EXTRACT(EPOCH FROM (now() - COALESCE(ok.last_200, runs.last_ok))) / 3600.0, 1),
         COALESCE(ok.last_200, runs.last_ok) IS NULL
           OR COALESCE(ok.last_200, runs.last_ok) < now() - interval '48 hours'
  FROM cron.job j
  LEFT JOIN runs ON runs.jobid = j.jobid
  LEFT JOIN ok ON ok.jobid = j.jobid
  WHERE j.active
  ORDER BY j.jobid;
$$;

REVOKE ALL ON FUNCTION public.cron_job_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_job_health() TO service_role;

CREATE OR REPLACE FUNCTION public.cron_jobs_stale()
RETURNS TABLE (
  jobid bigint,
  jobname text,
  hours_since_last_http_200 numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.jobid, h.jobname, h.hours_since_last_http_200
  FROM public.cron_job_health() h
  WHERE h.is_stale
$$;

REVOKE ALL ON FUNCTION public.cron_jobs_stale() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_jobs_stale() TO service_role;