# Business Objectives — SQL migration

Run this in the Supabase SQL editor (project `wjmaaagrlmwcesmovfwr`,
enzi-ws). It is idempotent — safe to run twice.

What it does:

1. Creates the global `business_objectives` table (same shape as
   `finding_categories`): an admin-managed list of business objectives.
2. Seeds it with the 7 BSI objectives from the workshop board
   (CASA, Saldo Giro, Jumlah Rekening (UREG), Pengguna Aktif (USAK),
   Frekuensi Transaksi, Fee-Based Income, Volume Transaksi Wholesale).
   Each `INSERT` is guarded by `NOT EXISTS`, so re-running never
   duplicates a name.
3. Adds `findings.tujuan_bisnis_ids` (JSONB array of objective ids).
   A finding can now carry MORE THAN ONE objective; the old free-text
   `tujuan_bisnis` column is left untouched, so findings written before
   this change keep displaying their old text as a fallback.

```sql
-- 1. Admin-managed list of business objectives (global, like
--    finding_categories).
CREATE TABLE IF NOT EXISTS business_objectives (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Seed the 7 objectives from the workshop board. Guarded by
--    NOT EXISTS so the migration is safe to re-run.
INSERT INTO business_objectives (name)
SELECT v.name FROM (VALUES
  ('CASA'),
  ('Saldo Giro'),
  ('Jumlah Rekening (UREG)'),
  ('Pengguna Aktif (USAK)'),
  ('Frekuensi Transaksi'),
  ('Fee-Based Income'),
  ('Volume Transaksi Wholesale')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM business_objectives b WHERE b.name = v.name
);

-- 3. A finding references its objectives by id (multi-select).
ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS tujuan_bisnis_ids JSONB NOT NULL DEFAULT '[]';
```

Verify after running:

```sql
SELECT id, name FROM business_objectives ORDER BY created_at;
-- 7 rows expected.

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'findings' AND column_name = 'tujuan_bisnis_ids';
-- 1 row, jsonb expected.
```
