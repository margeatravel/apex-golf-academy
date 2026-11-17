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
  WITH recent AS (
    SELECT d.jobid, d.start_time, d.return_message
    FROM cron.job_run_details d
    WHERE d.start_time > now() - interval '14 days'
      AND d.status = 'succeeded'
  ),
  runs AS (
    SELECT r.jobid, max(r.start_time) AS last_ok
    FROM recent r GROUP BY r.jobid
  ),
  ok AS (
    SELECT r.jobid, max(h.created) AS last_200
    FROM recent r
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

GRANT EXECUTE ON FUNCTION public.cron_job_health() TO postgres, authenticated, service_role;