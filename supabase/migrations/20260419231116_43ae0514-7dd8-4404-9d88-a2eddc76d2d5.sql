ALTER TABLE public.lessons
ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'MXN';

ALTER TABLE public.lessons
ADD CONSTRAINT lessons_currency_check CHECK (currency IN ('MXN','USD'));