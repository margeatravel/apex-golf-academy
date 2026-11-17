
-- Update Advance → Scratch (599 MXN = 59900 centavos)
UPDATE billing_plans 
SET name = 'Scratch', 
    price_amount = 59900,
    description = 'Full platform access, video viewing/uploading, preferred lesson pricing',
    updated_at = now()
WHERE id = '83b8d777-430c-454b-9f90-5e1f7d39412d';

-- Update Pro (999 MXN = 99900 centavos)
UPDATE billing_plans 
SET price_amount = 99900,
    description = 'Everything in Scratch plus fixed weekly lesson-time privileges and 1 free lesson/month',
    updated_at = now()
WHERE id = '23c736be-c05d-4c88-8f64-97da2a68afc9';

-- Update Free → Member
UPDATE billing_plans 
SET name = 'Member',
    description = 'Booking only, entry-level access',
    updated_at = now()
WHERE id = 'a1f8f92d-54e0-4010-a351-df69ad571797';
