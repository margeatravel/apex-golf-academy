ALTER TABLE class_packages
DROP CONSTRAINT IF EXISTS class_packages_ar_status_check;

ALTER TABLE class_packages
ADD CONSTRAINT class_packages_ar_status_check
CHECK (ar_status IN ('draft', 'active', 'active_pending'));