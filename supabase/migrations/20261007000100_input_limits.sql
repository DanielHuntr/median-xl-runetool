-- Limits on text players write that other players see. Additive only, and safe to run again.
--   1. A build's two skill names: their lengths had no limit, so one published build could
--      make everyone who opens Community builds download megabytes.
--   2. Names (builds, loot filters, skills) without control characters or the invisible
--      direction marks that make text display in a different order than it's written
--      ("‮txt.exe"), which could disguise a name in the community list.
-- "not valid": checked on every new save and edit; rows already saved aren't re-checked.

alter table public.builds drop constraint if exists builds_skills_length;
alter table public.builds add constraint builds_skills_length
  check (char_length(array_to_string(skills, '')) <= 120) not valid;

alter table public.builds drop constraint if exists builds_plain_text;
alter table public.builds add constraint builds_plain_text
  check (name !~ '[[:cntrl:]​-‏‪-‮⁦-⁩]'
     and array_to_string(skills, ' ') !~ '[[:cntrl:]​-‏‪-‮⁦-⁩]') not valid;

alter table public.loot_filters drop constraint if exists loot_filters_plain_name;
alter table public.loot_filters add constraint loot_filters_plain_name
  check (name !~ '[[:cntrl:]​-‏‪-‮⁦-⁩]') not valid;
