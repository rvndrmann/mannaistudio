-- Migration: Add is_paused status to courses table for admin pause/resume feature

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

-- Allow public read access to courses
CREATE INDEX IF NOT EXISTS courses_is_paused_idx ON public.courses(is_paused, created_at desc);
