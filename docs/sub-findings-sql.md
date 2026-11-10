# Sub Findings SQL — run once in the Supabase SQL Editor

Sub findings live inside a Finding (the linked items in the `ideas` table).
Each sub finding has a Fitur, a Description, and multiple image evidences —
each image evidence is one uploaded image plus its own description.

## Table

```sql
CREATE TABLE IF NOT EXISTS sub_findings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  fitur TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  images JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_findings_idea_id ON sub_findings(idea_id);
```

`images` is a JSONB array. Each entry is `{ "image_url": "<data URL>", "description": "<text>" }`.
Images are downscaled client-side to max 1200px (same as the finding's own
`image_url`) before they are stored, so a data URL stays small.

Deleting a finding deletes its sub findings automatically
(`ON DELETE CASCADE` on `idea_id`).

## Verify

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sub_findings'
ORDER BY ordinal_position;

SELECT count(*) FROM sub_findings;
```
