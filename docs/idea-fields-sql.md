# Idea fields change — SQL migration (2026-11-27)

User request 27 Nov 2026: remove the Tujuan + Scope fields from the
Create/Edit Idea form, rename "Output Keberhasilan" to "Cara/Alur
Kerja", and add two new text fields — "Impact yang diharapkan dari
inisiatif" and "Catatan/Batasan" — shown on the front pages too
(Cash Management + Digital Value Chain).

## What the code does

- The form no longer collects Tujuan or Scope. The old columns
  (`tujuan`, `scope_termasuk`, `scope_tidak_termasuk`,
  `role_users`, `role_users_tidak_termasuk`,
  `step_feature_screen`, `step_feature_screen_tidak_termasuk`,
  `apa_yang_berubah`, `apa_yang_berubah_tidak_termasuk`) are NOT
  dropped — legacy rows keep their values, nothing in the UI reads
  or writes them anymore.
- "Output Keberhasilan" is a label rename only: the column stays
  `output_keberhasilan`, the UI now calls it "Cara/Alur Kerja".
- Two new columns hold the new fields.

## Migration — run in the Supabase SQL Editor, project wjmaaagrlmwcesmovfwr

```sql
ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS impact_diharapkan TEXT,
  ADD COLUMN IF NOT EXISTS catatan_batasan TEXT;
```

Idempotent: safe to re-run; existing columns are left untouched.

## Verification queries (expect the rows shown)

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'findings'
  AND column_name IN ('impact_diharapkan', 'catatan_batasan')
ORDER BY column_name;
```

Expect 2 rows, both `data_type` = `text`:

| column_name       | data_type |
| ----------------- | --------- |
| catatan_batasan   | text      |
| impact_diharapkan | text      |
