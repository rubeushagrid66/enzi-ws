# Workshop Phase 2 — Participant self-service (design, not yet built)

Phase 1 (built, `/[slug]/workshop`) is facilitator-led: one driver records the
group's agreed mapping, votes, and card position on a shared screen. Phase 2
lets every participant score from their own phone, live, and keeps the
facilitator as the person who confirms the consensus.

## How it works (user flow)

1. **Join link.** The facilitator opens a session for a project and shares a
   link, e.g. `/[slug]/join` (or a short code / QR on the workshop screen).
   No account, no password: the participant picks their own name from the
   project's participant list. One name = one participant; the name choice
   is stored in localStorage so a refresh keeps their identity.
2. **Their own votes (Viability).** The participant sees the current finding
   and taps Validate / Not validated per aspect. Each vote is stored exactly
   as today — `viability_votes` keyed by `(finding_id, participant_id,
   aspect_id)` — so the existing upsert, scoring math, and live Viability %
   work unchanged. A participant can change their own vote until the
   facilitator closes the session.
3. **Their own dot (Feasibility).** The participant drags their own dot on
   the 2x2 matrix. Their dot is stored per participant (see schema note
   below) and shown to everyone as a small ghost dot with their name.
   The group position is the median of all participants' dots; the
   facilitator confirms it as the consensus position, which writes the
   existing `feasibility_x / feasibility_y` on the finding — the same
   PATCH route Phase 1 uses.
4. **Their own mapping (Desirability).** The participant ticks the L3
   segments they think apply. Desirability stays group-computed: a segment
   counts as mapped when a majority (or a facilitator-chosen threshold) of
   participants ticked it. The facilitator reviews the majority mapping and
   saves it through the existing POST parameters route.
5. **Live tally.** The facilitator's screen shows live counts (votes in,
   dots placed, mapping agreement) and refreshes as participants submit —
   poll the project GET route every few seconds, or add Supabase Realtime
   later. No new scoring math: the same `calculateDesirabilityScore`,
   `calculateViabilityScore`, `getFeasibilityFromCoordinates`, and composite
   functions are reused.
6. **Close the session.** The facilitator closes the session; scores lock
   (see schema). After closing, participant links become read-only and the
   ranked list is final.

## What changes in the code

- New public route `/[slug]/join` (participant identity picker, no login)
  and `/[slug]/participate` (the scoring view for one participant).
- Reuse `ViabilityVoteMatrix` (already extracted, per-participant) and
  `FeasibilityMatrix` (add an optional per-participant dot layer).
- Session state lives in one new table (below); the facilitator opens /
  closes it from the workshop page.

## Schema to add later (run in the Supabase SQL editor when ready)

No schema change was made for Phase 1. Phase 2 needs two small additions:

```sql
-- One scoring session per project (a project can have several over time).
create table workshop_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

-- Each participant's own dot on the matrix, per finding.
-- One dot per (session, finding, participant); the consensus position
-- stays on findings.feasibility_x / feasibility_y as today.
create table feasibility_dots (
  session_id uuid not null references workshop_sessions (id) on delete cascade,
  finding_id uuid not null references findings (id) on delete cascade,
  participant_id uuid not null references participants (id) on delete cascade,
  x numeric not null,
  y numeric not null,
  updated_at timestamptz not null default now(),
  primary key (session_id, finding_id, participant_id)
);

-- Lock: once a session is closed, scores are final. Enforce in the API
-- (reject writes when the project's latest session is closed) rather
-- than with triggers, so the rule stays visible in code.
-- Optional, later: a scored/locked flag on findings is unnecessary —
-- the existing derived scoring status (D/V/F data present) already
-- tells the UI a finding is scored; the session status is what locks it.
```

## Open decisions (ask the user before building Phase 2)

- Desirability majority threshold: simple majority, or 2/3?
- Should a participant see others' votes/dots live, or only after they
  submit their own (avoids herding)?
- Join link: open to anyone with the link, or a short per-session code?
