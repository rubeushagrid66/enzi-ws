# Global setup — Supabase SQL (one-time)

Findings & Tags, Framework & Weighting, and L1–L3 Parameters are now
GLOBAL: one findings pool, one D/V/F weighting, and one parameter tree
for the whole platform, used by every project. Users were already
global. The code in this repo already reads and writes these global
structures, but the columns/table themselves have to exist in Supabase
first — run everything below once in the Supabase dashboard
→ SQL Editor → Run.

## Step 1 — Aspect → framework column (from the earlier linkage work)

```sql
alter table viability_aspects add column if not exists framework text not null default 'Viability';
alter table viability_aspects add column if not exists label text;
```

The `label` column holds each aspect's label (Business & Ops, Product,
or Tech). It is needed before labels will stick: until it exists, the
code saves aspects without a label and reads them as unlabeled.

## Step 2 — Allow pool findings and a global parameter tree

Pool findings belong to no project yet (`project_id` NULL); the global
parameter tree likewise has `project_id` NULL.

```sql
alter table findings alter column project_id drop not null;
alter table parameters_l1 alter column project_id drop not null;
```

## Step 3 — Global settings table (holds the global DVF weights)

```sql
create table if not exists global_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
```

## Step 4 — Migration: B2B's tree and weights become the global ones

The B2B Cash Management project (`slug = 'cash-management-system'`)
is the source of truth. These statements are idempotent — running
them twice changes nothing the second time.

```sql
-- The B2B parameter tree becomes the global tree (project_id NULL).
update parameters_l1
set project_id = null
where project_id = (select id from projects where slug = 'cash-management-system');

-- The B2B weights (40/30/30) become the global weights,
-- but only if no global weights exist yet.
insert into global_settings (key, value)
select 'framework_weights',
       jsonb_agg(
         jsonb_build_object('name', name, 'weight', weight)
         order by case name when 'Desirability' then 1 when 'Viability' then 2 else 3 end
       )
from framework_weights
where project_id = (select id from projects where slug = 'cash-management-system')
  and not exists (select 1 from global_settings where key = 'framework_weights')
having count(*) > 0;
```

## Before this SQL is run

The app keeps working exactly as before, on purpose:

- Scoring falls back to each project's own weights and parameter tree,
  so existing findings keep their exact scores.
- The findings pool lists the projects' findings (with their project
  shown); pool findings just can't be *created* yet, and copying a
  finding into a project still works.
- The admin Weights / Parameters tabs show a notice that the global
  setup is not enabled yet, with a pointer to this file. Saving global
  weights or creating global parameters / pool findings before the SQL
  runs returns a clear error naming this file — nothing is silently lost.

## After this SQL is run

- Framework & Weighting in admin edits the one global D/V/F weighting;
  every project's viewer, workshop, and home-page card uses it.
- L1–L3 Parameters in admin edits the one global tree; every project
  scores Desirability against it. (Other projects' old per-project
  parameter rows stay in the database as an unused fallback.)
- Findings & Tags in admin is the global pool: pool findings (no
  project) plus every project's findings, each labelled with its
  origin. Selecting a pool finding in a workshop *copies* it into that
  project — the copy is scored independently, the pool original stays
  Unscored.
- Users & Roles were already global (no `project_id` on users); the
  admin tab no longer depends on the selected project.
- Viability Aspects stay per-project (the user did not ask to
  globalise them).

## Step 5 — Viability scoring 1–3 with Alasan (run once)

Each viability vote is now a 1–3 score with a per-aspect reason
(Alasan), and each login user votes as their own participant row
(`participants.user_id`). Until these columns exist, the code saves
votes as the old boolean only — scores and reasons do not stick, and
"me" participants are matched by name instead of by login id.

```sql
alter table viability_votes add column if not exists score int;
alter table viability_votes add column if not exists reason text;
alter table participants add column if not exists user_id text;
```

Notes: `score` is 1, 2 or 3 (null = no score yet). A vote with a
score set counts as validated for the current Viability formula, so
existing boolean-only votes keep counting exactly as before. The new
1–3 scoring formula itself comes later and is not part of this step.

## Step 6 — User group assignment (run once)

Each login user can be assigned to a group from the dashboard Users
tab ("Group" field). The assigned group is where that user's "me"
participant lives, so their votes land in that group (the group chips
in the scoring table mark it with "• Me"). Until this column exists,
the field does not stick and the participant falls back to name
matching or the project's first group.

```sql
alter table users add column if not exists group_id text;
```

Notes: `group_id` is null when no group is assigned. It references a
group id; groups are per-project, so a user assigned to a group in one
project keeps that assignment when another project is selected — the
participant is only moved when the assigned group belongs to the
project being scored.

## Step 7 — User project assignment (run once)

Each login user can be assigned to a project from the dashboard Users
tab ("Project" field). Label-role users (Tech / Product / Business &
Ops) assigned to a project can only score in that project — the /me
endpoint answers 403 elsewhere and no participant row is created
there; ADMIN and FACILITATOR work across projects. Until this column
exists, the field does not stick and users keep the previous
behaviour (no project restriction).

```sql
alter table users add column if not exists project_id text;
```

Notes: `project_id` is null when no project is assigned. When both a
project and a group are set, the group must belong to that project
(the API rejects a mismatch and clears a kept group when the project
changes). A group on its own implies its project.

## Step 8 — Manual board pin (run once)

A dragged board card is a manual pin: its stored position wins over the
computed one until it is reset. The pin flag lives on the finding.

```sql
alter table findings add column if not exists feasibility_manual boolean default false;
```

Notes: until this column exists, the code still works — a drag saves its
coordinates but the pin does not persist, so the card returns to its
computed position on the next load. After the SQL runs, pins persist.
