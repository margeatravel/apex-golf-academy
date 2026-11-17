ALTER TABLE public.parent_access_grants
ADD COLUMN IF NOT EXISTS relationship text
CHECK (relationship IN ('papa','mama','tutor'));