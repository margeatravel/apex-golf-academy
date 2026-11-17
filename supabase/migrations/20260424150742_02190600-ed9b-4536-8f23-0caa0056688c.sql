-- Reassign Luciano senor's orphaned recurring slots to merged primary (Luciano Garcia Rangel)
UPDATE public.recurring_lesson_slots
SET student_id = '1e45a117-3b55-4672-b8bd-53060e35654e',
    updated_at = now()
WHERE student_id = '4cf89fe5-05c4-4aa8-ab7c-6e8d5aaf36f6';