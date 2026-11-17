GRANT EXECUTE ON FUNCTION public.cron_job_health() TO postgres, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_jobs_stale() TO postgres, authenticated;