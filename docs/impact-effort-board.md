# Impact vs Effort board — future: position computed from D/V/F scores

Status: **design prepared, NOT built.** Builds on the 1-3 scoring work
(commit 36eb5ee, 2026-11-06). Build only when the user defines the
1-3 scoring formula ("the calculation later") — this board work consumes
the D/V/F numbers that formula produces.

## What the user asked (2026-11-06 14:29 WIB)

Later, the D/V/F scores should produce each finding's position on the
impact vs effort board — and the board must stay draggable.

## How the board works today

- The board is the feasibility matrix (`src/components/FeasibilityMatrix.tsx`).
  Axes: **X = Effort** (0 = high effort, 100 = low effort / easy),
  **Y = Impact** (0 = low impact, 100 = high impact).
  Quadrants: Big Bets (high impact, high effort), Quick Wins (high impact,
  low effort), Avoid (low impact, high effort), Fill-ins (low impact,
  low effort). The 50/50 lines split the quadrants.
- Positions today are **manual only**: a facilitator drags a card in the
  workshop; the drop writes `feasibility_x` / `feasibility_y` on the finding.
  An unplaced finding (null coordinates) shows at 50/50 as a neutral default
  with no quadrant and no score until it is dropped somewhere.
- The Feasibility score today is **derived from the position**:
  `getFeasibilityFromCoordinates()` in `src/lib/scoring.ts` maps the quadrant
  to a score (Avoid 25, Fill-ins 50, Big Bets 75, Quick Wins 100) and blends
  it with the validation % of Feasibility-linked aspects when those have votes.

## The key problem: circularity

Today, position → F score. The future model wants F score → position.
Both cannot be true at once. Resolution (decided in this design):

- **In the future model, F comes only from the Feasibility-linked aspect
  votes** (the 1-3 scores, via the formula the user will define). The
  quadrant stops feeding F.
- The board position becomes an **output** of the scores, not an input
  to them. Dragging a card moves its displayed position only — it never
  changes any score.

## Proposed position mapping (to confirm when the formula is defined)

- **Impact (Y) = Desirability + Viability.** Both measure value/impact.
  Proposed: `Y = weighted average of D and V`, using the global D/V
  weights (33/33 today, so an equal average for now).
- **Effort (X) = Feasibility, directly.** F is 0–100 where 100 = most
  feasible = easiest, which is exactly the X axis (100 = low effort).
  Proposed: `X = F`.
- The composite DVF score is unchanged (weighted average of D, V, F).
- **Unscored findings have no computed position.** If any of D, V, F is
  unscored, the finding stays unplaced (50/50 neutral, no quadrant),
  consistent with today's "Awaiting scoring" handling. A manually dragged
  card keeps its manual position even while unscored.

## Draggable: manual override semantics

- **Default: computed.** When a finding is fully scored and has never been
  dragged, its position is computed from its scores. When the scores
  change, the card moves automatically.
- **Dragging pins the card.** Dropping a card writes the manual position
  (same `feasibility_x` / `feasibility_y` columns as today) and marks it
  manual. A pinned card **does not move** when scores change afterwards.
- **Reset.** A "Reset to computed position" action (per card; consider a
  per-board reset too) clears the pin and the card snaps back to its
  computed position. Reset is only meaningful for fully scored findings.
- **Visible state.** A manually placed card shows a small marker (e.g. a
  "manual" badge / different border) so the team can tell score-driven
  positions from hand-placed ones. The quadrant badge on a card always
  reflects its **displayed** position, as today.
- Dragging never changes D, V, or F. (Alternative considered and rejected:
  letting a drag feed back into F — that reintroduces the circularity
  above.)

## What will change in code (when built)

- `src/lib/scoring.ts`: new `computeBoardPosition(d, v, f)` (or similar);
  `getFeasibilityFromCoordinates()` stops being an F input — F becomes the
  F-aspect score only.
- Schema: a position-source marker. Simplest shape: keep
  `feasibility_x` / `feasibility_y` as the **displayed** position and add
  a `position_manual` boolean (default false). When false and all three
  dimensions are scored, displayed = computed; when true, displayed = the
  stored manual values. Needs a Supabase SQL migration (same pattern as
  `docs/global-setup-sql.md`).
- `src/components/FeasibilityMatrix.tsx`: render computed vs manual state,
  drag sets manual, reset button clears it; unplaced findings keep the
  50/50 neutral default.
- Viewer: computed positions update live when scores change (existing
  revalidation + focus refresh already covers this).
- No change to the vote model, the roles, or the workshop flow.

## Order of work

1. Step 5 SQL (score/reason/user_id columns) — user to run.
2. The 1-3 scoring formula (user to define) — produces D/V/F 0–100.
3. This board work — consumes those numbers.

## Open questions (for the user, when the formula is defined)

1. Impact = average of D and V, or should D weigh more than V (or the
   other way round)?
2. Effort = F directly, or scaled/inverted somehow?
3. When a pinned card's scores change, show a hint ("scores changed —
   position is manual") or stay silent?
4. Should a board-wide "reset all to computed" exist, or per-card only?
