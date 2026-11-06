# Aspect → framework linkage — Supabase SQL

Aspects (Aspek) can be linked to a framework — Desirability, Viability, or
Feasibility — and the linkage feeds that framework's score (see
`src/lib/scoring.ts`, blend rule). The code already reads and writes the
`framework` column, but the column itself has to exist in Supabase first.

## One-time step (Supabase dashboard → SQL Editor → run)

```sql
alter table viability_aspects add column if not exists framework text not null default 'Viability';
```

That's it — one line. Existing aspects keep working as Viability (the
default), so nothing changes until an admin re-links an aspect in the
admin dashboard (Viability Aspects → edit → Framework).

## Before this SQL is run

The app tolerates the missing column on purpose:

- Reads default a missing `framework` to `"Viability"`, so scores are
  exactly as before.
- Aspect create/update retries the write without the `framework` column
  if Supabase rejects it, and logs a warning. The aspect is saved, only
  the linkage is not (it will read back as Viability until the SQL runs).

## After this SQL is run

- Admin can link any aspect to Desirability / Viability / Feasibility.
- Votes on an aspect feed its linked framework's score:
  - Desirability = average of the L3-mapping score and the validation %
    of Desirability-linked aspects (whichever inputs exist).
  - Viability = validation % of Viability-linked aspects only.
  - Feasibility = average of the matrix-quadrant score and the validation
    % of Feasibility-linked aspects (whichever inputs exist).
- No other SQL is needed: no new tables, no data migration.
