# Findings Category + Idea Detail Fields — SQL

Run these in the Supabase SQL Editor for project `wjmaaagrlmwcesmovfwr`
("Duckey Longbottom"). Run them verbatim, in order. No DELETE/UPDATE of
existing rows.

## 1. Findings Category table

Categories are global (like Findings): one category list shared by Cash
Management System and Digital Value Chain.

```sql
CREATE TABLE IF NOT EXISTS finding_categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 2. Category on a Finding (the `ideas` table)

A Finding belongs to at most one category. Deleting a category clears the
link (SET NULL) instead of deleting the Finding.

```sql
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES finding_categories(id) ON DELETE SET NULL;
```

## 3. Idea detail fields (the `findings` table)

The Create/Edit Idea form's new fields. All optional text.

```sql
ALTER TABLE findings ADD COLUMN IF NOT EXISTS tujuan TEXT;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS scope_termasuk TEXT;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS scope_tidak_termasuk TEXT;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS role_users TEXT;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS step_feature_screen TEXT;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS apa_yang_berubah TEXT;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS output_keberhasilan TEXT;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS tujuan_bisnis TEXT;
```

## Verification

```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'finding_categories' ORDER BY ordinal_position;
SELECT count(*) FROM finding_categories;
SELECT column_name FROM information_schema.columns WHERE table_name = 'ideas' AND column_name = 'category_id';
SELECT column_name FROM information_schema.columns WHERE table_name = 'findings' AND column_name IN ('tujuan','scope_termasuk','scope_tidak_termasuk','role_users','step_feature_screen','apa_yang_berubah','output_keberhasilan','tujuan_bisnis') ORDER BY column_name;
```

Expected: `finding_categories` has 4 columns (id, name, created_at,
updated_at), count 0; `ideas` has `category_id`; `findings` has all 8 new
columns. RLS is off on the ideas tables (same as the other tables here) —
choose "Run without RLS" if the editor warns about it.
