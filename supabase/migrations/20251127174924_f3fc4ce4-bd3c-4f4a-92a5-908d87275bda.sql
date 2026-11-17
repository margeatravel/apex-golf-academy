-- Add GHIN number to profiles
ALTER TABLE profiles 
ADD COLUMN ghin_number TEXT,
ADD COLUMN ghin_last_updated TIMESTAMPTZ;

-- Create index for GHIN lookups
CREATE INDEX idx_profiles_ghin ON profiles(ghin_number) WHERE ghin_number IS NOT NULL;