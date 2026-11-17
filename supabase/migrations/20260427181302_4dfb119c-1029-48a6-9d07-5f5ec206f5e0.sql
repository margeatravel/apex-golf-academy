-- Remove duplicate trigger (lessons_status_change_handler_trg covers INSERT OR UPDATE);
-- trg_lessons_status_change is redundant and fires the same handler.
DROP TRIGGER IF EXISTS trg_lessons_status_change ON public.lessons;

-- Remove leftover test lesson row from manual verification
DELETE FROM public.lessons WHERE id = 'f651ecf9-921a-4eca-a771-cdbc4ccccf80';