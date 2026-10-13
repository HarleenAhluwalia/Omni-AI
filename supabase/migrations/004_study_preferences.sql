
-- Run only after checking for duplicate preference rows per user.
-- This migration does not modify Jerry's notification_settings table.

ALTER TABLE public.preferences
  ADD COLUMN IF NOT EXISTS deadline_weight integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS priority_weight integer NOT NULL DEFAULT 35,
  ADD COLUMN IF NOT EXISTS effort_weight integer NOT NULL DEFAULT 25;

-- Ensure one preferences record per authenticated user for upsert.
CREATE UNIQUE INDEX IF NOT EXISTS
  preferences_user_id_unique
ON public.preferences(user_id);
