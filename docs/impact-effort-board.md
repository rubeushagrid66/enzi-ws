# Impact vs Effort board — BUILT 2026-11-07 (position computed from D/V/F scores)

Status: **built and shipped 2026-11-07; D formula replaced 2026-11-08.**
The board formula the user defined (22:59 WIB 2026-11-07) is implemented.
D's own formula is now defined too (user, 2026-11-08): D is 1–3 from
research mentions (Wawancara + Survey), not the L3-mapping score — L3
mapping was deleted. No 0–100 composite anywhere (removed 2026-11-07,
per the user's "jangan pake composite 0-100").

## What the user asked (2026-11-06 14:29 WIB)

Later, the D/V/F scores should produce each finding's position on the
impact vs effort board — and the board must stay draggable.

## The formula as defined (user, 2026-11-07 22:59 WIB)

- **Impact (Y) = rata-rata berbobot D dan V** (weighted average of D
  and V). D and V are both 1–3, each normalized to 0–100 as
  (score−1)/2×100 (3 → 100, 2 → 50, 1 → 0). Weights are equal (50/50)
  — the same equal split as the 33/33/33 framework weights. Assumption
  to confirm with the user: the 50/50 split was not specified; it is
  the natural equal default.
- **Effort = taken from feasibility (F).** F is 1–3 (3 = easiest).
  X = (F−1)/2×100, so F 3 → X 100 (low effort, right) and F 1 → X 0
  (high effort, left). The user's earlier "rata-rata empat aspek
  Effort" was corrected by them to "Effort is taken from feasibility
  (F)" — so Effort averages however many Feasibility aspects exist,
  via the F formula (4 − average of Effort aspect scores). DVC has
  3 Feasibility aspects, not 4.
- **Per participant:** D is shared, V and F are the viewer's own, so
  the board position is the viewer's own too. The quadrant badge on a
  card reflects its **displayed** position (pinned or computed).
- **Unscored findings have no computed position.** If any of D, V, F
  is unscored for the viewer, the finding stays unplaced (50/50
  neutral, no quadrant), consistent with "Awaiting scoring". A manually
  dragged card keeps its manual position even while unscored.

## How the board works now (built 2026-11-07)

- The board is the feasibility matrix (`src/components/FeasibilityMatrix.tsx`).
  Axes: **X = Effort** (0 = high effort, 100 = low effort / easy),
  **Y = Impact** (0 = low impact, 100 = high impact).
  Quadrants: Big Bets (high impact, high effort), Quick Wins (high impact,
  low effort), Avoid (low impact, high effort), Fill-ins (low impact,
  low effort). The 50/50 lines split the quadrants.
- Positions are **computed by default** from the viewer's scores
  (`calculateBoardPosition` / `findingBoardPosition` in
  `src/lib/scoring.ts`). When the scores change, the card moves
  automatically. An unplaced finding (no pin, incomplete scores) shows
  at 50/50 as a neutral default with no quadrant until it is scored or
  dropped somewhere.
- F comes **only from the Feasibility-linked aspect votes** (the 1–3
  scores, F = 4 − average of Effort aspect scores). The quadrant no
  longer feeds F — the circularity is resolved: `getFeasibilityFromCoordinates()`
  is still used for quadrant/labels from a position, but its `score`
  is never used as F.
- The board position is an **output** of the scores, not an input to
  them. Dragging a card moves its displayed position only — it never
  changes any score.

## The key problem: circularity (resolved)

Today, position → F score. The future model wants F score → position.
Both cannot be true at once. Resolution (decided in this design, now
built):

- **F comes only from the Feasibility-linked aspect votes** (the 1-3
  scores, via the formula the user defined). The quadrant stops feeding F.
- The board position becomes an **output** of the scores, not an input
  to them. Dragging a card moves its displayed position only — it never
  changes any score.

## Position mapping (built, 2026-11-07)

- **Impact (Y) = weighted average of D and V**, 50/50, with D and V
  each normalized (score−1)/2×100. Y = (D_norm + V_norm) / 2.
- **Effort (X) = F**, mapped X = (F−1)/2×100.
- **Unscored findings have no computed position.** If any of D, V, F is
  unscored, the finding stays unplaced (50/50 neutral, no quadrant),
  consistent with today's "Awaiting scoring" handling. A manually dragged
  card keeps its manual position even while unscored.

## Draggable: manual override semantics (built)

- **Default: computed.** When a finding is fully scored and has never been
  dragged, its position is computed from its scores. When the scores
  change, the card moves automatically.
- **Dragging pins the card.** Dropping a card writes the manual position
  (same `feasibility_x` / `feasibility_y` columns as before) and sets
  `feasibility_manual` = true (Step 8 SQL, `docs/global-setup-sql.md`).
  A pinned card **does not move** when scores change afterwards.
  Until Step 8 is run, a drag still saves its coordinates but the pin
  does not persist (the card returns to its computed position on the
  next load).
- **Reset.** A "Reset to computed" button on the board (admin, per card)
  clears the pin and the card snaps back to its computed position.
  Reset is only meaningful for fully scored findings.
- **Visible state.** A manually placed card shows a "Manual position"
  chip (and "· manual" on its viewer-card quadrant badge); a computed
  position shows "Computed from your scores". The quadrant badge on a
  card always reflects its **displayed** position.
- Dragging never changes D, V, or F. (Alternative considered and rejected:
  letting a drag feed back into F — that reintroduces the circularity
  above.)

## What changed in code (built 2026-11-07)

- `src/lib/scoring.ts`: `calculateBoardPosition(d, v, f)` and
  `findingBoardPosition(finding, meId)`; `getFeasibilityFromCoordinates()`
  is used for quadrant/labels only — F comes from the F-aspect scores.
- Schema: `findings.feasibility_manual` boolean (default false), Prisma
  `Finding.feasibilityManual`; Step 8 SQL in `docs/global-setup-sql.md`.
  `db-service.updateFindingFeasibility` takes an optional `manual` flag
  (with missing-column retry tolerance); new
  `setFindingFeasibilityManual(id, manual)`.
- `src/components/FeasibilityMatrix.tsx`: renders computed vs manual
  state, drag sets the pin, reset button clears it; unplaced findings
  keep the 50/50 neutral default. Takes a `meId` prop (positions are
  per participant).
- Viewer: quadrant filter and card quadrant badges use the displayed
  (pinned or computed) quadrant; detail view and workshop Step 3 show
  the same. No change to the vote model or the roles.
- No composite anywhere: V/F are shown on the 1–3 scale only.

## Order of work (done)

1. Step 5 SQL (score/reason/user_id columns) — run.
2. The 1-3 scoring formula (V/F per participant) — defined and built.
3. This board work — built 2026-11-07.

## Open questions (for the user, later)

1. Impact weights: 50/50 was used as the equal default — confirm, or
   give a different D vs V split.
2. D's own formula — DEFINED 2026-11-08 (research mentions, 1–3).
   L3 mapping deleted. See the D rule in the summary below.
3. When a pinned card's scores change, show a hint ("scores changed —
   position is manual") or stay silent?
4. Should a board-wide "reset all to computed" exist, or per-card only?

## D's formula (user, 2026-11-08) — research mentions, 1–3

- A "mention" is a user mentioning the finding in that source.
- Wawancara: N = interview users in the project (Cash 3, DVC 2).
  ≥ 66% mention → 3, ≥ 33% → 2, below 33% → 1.
- Survey: N = survey respondents in the project (Cash 121, DVC 123).
  ≥ 30% mention → 3, ≥ 15% → 2, below 15% → 1.
- Internal is NOT a research source and is never counted.
- D = round-up average of the two source scores (2.5 → 3); a single
  source stands alone; no source → D null (not yet scored).
- Example: Pengingat otomatis — interview 2 of 3 (67%) = 3, survey
  40 of 121 (33%) = 3, so D = 3.
- Counts are entered per finding (detail page, Tab 1: Desirability);
  the basis N per project is set in the dashboard (Framework &
  Weighting → Research Basis, admin only). SQL: Step 9 in
  docs/global-setup-sql.md.
