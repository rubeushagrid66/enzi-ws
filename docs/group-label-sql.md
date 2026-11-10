# Group label (role) — Step: label gate

Run once in the Supabase SQL Editor for project `wjmaaagrlmwcesmovfwr`.

## What this does

Adds a `label` column to `groups` (Product / Tech / Business & Ops) and
assigns a role to each of the six groups. A group only scores the
aspects whose label matches its assigned role (the label gate, enforced
in the vote API and the V&F table). Ideas are no longer assigned to
groups — every group scores every idea in the project.

Mapping (group number → role, same in both projects):
- Grup 1 = Product
- Grup 2 = Tech
- Grup 3 = Business & Ops

## SQL

```sql
-- 1. Add the label column (idempotent).
ALTER TABLE groups ADD COLUMN IF NOT EXISTS label TEXT;

-- 2. Assign roles. Group ids are stable (from the project data):
--    CMS: grp_1 / grp_2 / grp_3
--    DVC: 69480cb5-2ebc-400f-9f89-08bd59f939db (Grup 1),
--         c2492b0e-a333-4e46-acd3-d5a1bdad846b (Grup 2),
--         e04df247-b9a1-4637-9a5a-b6cb4a1a9a2c (Grup 3)
UPDATE groups SET label = 'Product' WHERE id IN (
  'grp_1', '69480cb5-2ebc-400f-9f89-08bd59f939db'
);
UPDATE groups SET label = 'Tech' WHERE id IN (
  'grp_2', 'c2492b0e-a333-4e46-acd3-d5a1bdad846b'
);
UPDATE groups SET label = 'Business & Ops' WHERE id IN (
  'grp_3', 'e04df247-b9a1-4637-9a5a-b6cb4a1a9a2c'
);

-- 3. Verify.
SELECT id, project_id, name, label FROM groups ORDER BY project_id, name;
```

## Verify

```sql
SELECT id, name, label FROM groups ORDER BY project_id, name;
-- Expect 6 rows: each project's Grup 1 = Product, Grup 2 = Tech,
-- Grup 3 = Business & Ops.
```
