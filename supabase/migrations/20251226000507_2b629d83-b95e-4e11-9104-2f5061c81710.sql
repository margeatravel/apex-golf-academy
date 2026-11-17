-- Add coach feedback fields to videos table
ALTER TABLE videos 
ADD COLUMN IF NOT EXISTS coach_feedback TEXT,
ADD COLUMN IF NOT EXISTS next_steps TEXT,
ADD COLUMN IF NOT EXISTS feedback_added_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS student_notified BOOLEAN DEFAULT false;