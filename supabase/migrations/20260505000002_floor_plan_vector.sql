-- Floor-plan vectorization (Haiku-extracted clean spec).
--
-- Stored as JSONB on the project so we can render a clean SVG version
-- of the floor plan instead of (or alongside) the photo upload. The shape
-- is enforced application-side; see `FloorPlanVector` in lib/supabase/types.ts.

alter table public.projects
  add column if not exists floor_plan_vector jsonb;
