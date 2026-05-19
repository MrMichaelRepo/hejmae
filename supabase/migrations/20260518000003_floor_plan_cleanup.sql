-- Drop the Haiku/Sonnet vectorized floor-plan feature (clean-image + vector
-- view). The waterfall of "photo → extracted SVG" never produced output
-- reliable enough to ship; we keep the simpler photo + auto-straighten
-- pipeline and add a manual rotate.

alter table public.projects
  drop column if exists floor_plan_vector;

-- Per-user toggle for the AI auto-straighten/crop pass at upload time
-- (was a deployment-wide env flag). Default on.
alter table public.users
  add column if not exists auto_straighten_floor_plans boolean not null default true;
