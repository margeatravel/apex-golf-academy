SET LOCAL session_replication_role = 'replica';

UPDATE public.profiles
SET plan_tier = 'free',
    manual_plan_override = NULL,
    override_expires_at = NULL,
    override_set_by = NULL,
    override_set_at = NULL,
    updated_at = now()
WHERE id = 'c860e001-60fb-4869-9818-e1e73ae1b971';

SET LOCAL session_replication_role = 'origin';