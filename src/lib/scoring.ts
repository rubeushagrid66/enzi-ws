export interface WeightInput {
  name: string;
  weight: number;
}

export interface ScoringRule {
  minPercent: number; // e.g., 66, 33, 0
  score: number;      // e.g., 3, 2, 1
  label?: string;
}

/** One research source's contribution to Desirability (1–3). */
export interface ResearchSourceScore {
  source: "Wawancara" | "Survey";
  /** Users who mentioned this finding (null = not entered yet). */
  mentions: number | null;
  /** Total users in this source for the project (null = basis not set). */
  total: number | null;
  /** Mentions as a % of the total, one decimal (null when no data). */
  percent: number | null;
  /** 1–3 from the source's thresholds (null when no data). */
  score: number | null;
}

export interface DesirabilityResult {
  /** D on the 1–3 scale (null when no source has data — not yet scored). */
  score: number | null;
  interview: ResearchSourceScore;
  survey: ResearchSourceScore;
  formulaExplanation: string;
  /** The source scores that were averaged into D (1–3 each). */
  inputs: BlendInput[];
}

export type ScoringDimension = "Desirability" | "Viability" | "Feasibility";

/** The three frameworks an aspect can be linked to. */
export const FRAMEWORKS: ScoringDimension[] = [
  "Desirability",
  "Viability",
  "Feasibility",
];

/**
 * Normalizes a stored/raw framework value. Anything unknown or missing
 * is "Viability" — every aspect created before the linkage existed
 * behaves exactly as it did before.
 */
export function normalizeFramework(value: any): ScoringDimension {
  if (value === "Desirability" || value === "Feasibility") return value;
  return "Viability";
}

/**
 * Blend rule (Option B — aspect linkage feeds scoring): within one
 * dimension, the score is the average of the inputs that are available
 * for that dimension. If only one input exists, that input alone is the
 * score. If none exists, the dimension is unscored (null), never 0.
 */
export interface BlendInput {
  label: string;
  score: number; // 0-100
}

export function blendDimensionInputs(
  inputs: Array<BlendInput | null | undefined>
): { score: number | null; inputs: BlendInput[] } {
  const available = (inputs.filter(
    (i): i is BlendInput => i != null && Number.isFinite(i.score)
  ) ?? []) as BlendInput[];
  if (available.length === 0) return { score: null, inputs: [] };
  const avg = available.reduce((sum, i) => sum + i.score, 0) / available.length;
  return { score: Number(avg.toFixed(1)), inputs: available };
}

export interface FindingScoringStatus {
  desirabilityScored: boolean;
  viabilityScored: boolean;
  feasibilityScored: boolean;
  /** True only when all three dimensions have workshop data. */
  scored: boolean;
  /** Dimensions still awaiting workshop scoring, in D/V/F order. */
  pending: ScoringDimension[];
}

/**
 * Derives a finding's scoring status from existing data only — no status
 * column exists. A dimension counts as scored only when the workshop
 * produced data for it: research mentions that yield a Desirability
 * score (Desirability), a vote on a Viability-linked aspect (Viability),
 * or a vote on a Feasibility-linked aspect (Feasibility). A finding
 * with no workshop data is Unscored. Note: placing a card on the 2x2
 * board does NOT score Feasibility — F comes only from Feasibility
 * aspect votes. Internal is not a research source and never scores D.
 */
export function getFindingScoringStatus(
  finding: {
    interviewMentions?: number | null;
    surveyMentions?: number | null;
    viabilityVotes?: Array<any> | null;
    feasibilityX?: number | null;
    feasibilityY?: number | null;
  },
  aspects?: Array<{ id: string; framework?: any }> | null,
  researchN?: { interviewN?: number | null; surveyN?: number | null } | null
): FindingScoringStatus {
  const votes = finding.viabilityVotes ?? [];
  // Desirability is scored only when the research mentions yield a D
  // (at least one source has a count and a basis N). No source = unscored.
  const desirabilityScored =
    calculateDesirabilityFromResearch(
      finding.interviewMentions ?? null,
      researchN?.interviewN ?? null,
      finding.surveyMentions ?? null,
      researchN?.surveyN ?? null
    ).score != null;
  let viabilityScored = votes.length > 0;
  // Feasibility is scored only by votes on Feasibility-linked aspects —
  // a placed board position is visual placement, not a score.
  let feasibilityScored = false;
  if (aspects && aspects.length > 0) {
    // Aspect linkage: a vote only scores the dimension its aspect is
    // linked to. Without aspects, fall back to the old rule (any vote
    // scores Viability).
    const idsFor = (dim: ScoringDimension) =>
      new Set(
        aspects
          .filter((a) => normalizeFramework(a.framework) === dim)
          .map((a) => a.id)
      );
    const vIds = idsFor("Viability");
    const fIds = idsFor("Feasibility");
    viabilityScored = votes.some((v: any) => vIds.has(v.aspectId));
    if (votes.some((v: any) => fIds.has(v.aspectId))) feasibilityScored = true;
  }
  const pending: ScoringDimension[] = [];
  if (!desirabilityScored) pending.push("Desirability");
  if (!viabilityScored) pending.push("Viability");
  if (!feasibilityScored) pending.push("Feasibility");
  return {
    desirabilityScored,
    viabilityScored,
    feasibilityScored,
    scored: pending.length === 0,
    pending,
  };
}

/**
 * Desirability from research numbers (the user's rule, 2026-11-08).
 * A "mention" is a user mentioning this finding in that source.
 *
 * - Wawancara (interview): N = interview users in this project
 *   (Cash 3, DVC 2). ≥ 66% mention → 3 (Tinggi), ≥ 33% → 2 (Sedang),
 *   below 33% → 1 (Rendah).
 * - Survey: N = survey respondents in this project (Cash 121, DVC
 *   123). ≥ 30% mention → 3, ≥ 15% → 2, below 15% → 1.
 * - Internal is NOT a research source and is never counted.
 * - D = the average of the two source scores, rounded UP (2.5 → 3).
 *   With only one source, D is that source's score. With no source
 *   (no count entered, or the project's basis N not set), D is null —
 *   the finding is not yet scored, never a 0 or a 1.
 *
 * Example: Pengingat otomatis — interview 2 of 3 (67%) = 3, survey
 * 40 of 121 (33%) = 3, so D = 3.
 */
export function calculateDesirabilityFromResearch(
  interviewMentions: number | null | undefined,
  interviewN: number | null | undefined,
  surveyMentions: number | null | undefined,
  surveyN: number | null | undefined
): DesirabilityResult {
  const sourceScore = (
    source: "Wawancara" | "Survey",
    mentions: number | null | undefined,
    total: number | null | undefined,
    highPct: number,
    midPct: number
  ): ResearchSourceScore => {
    const m = mentions != null && Number.isFinite(Number(mentions)) ? Number(mentions) : null;
    const n = total != null && Number.isFinite(Number(total)) && Number(total) > 0 ? Number(total) : null;
    if (m == null || n == null) {
      return { source, mentions: m, total: n, percent: null, score: null };
    }
    const frac = m / n;
    const percent = Number((frac * 100).toFixed(1));
    const score = frac >= highPct / 100 ? 3 : frac >= midPct / 100 ? 2 : 1;
    return { source, mentions: m, total: n, percent, score };
  };

  const interview = sourceScore("Wawancara", interviewMentions, interviewN, 66, 33);
  const survey = sourceScore("Survey", surveyMentions, surveyN, 30, 15);
  const available = [interview, survey].filter((s) => s.score != null);
  const inputs: BlendInput[] = available.map((s) => ({
    label: `${s.source} ${s.score}`,
    score: s.score as number,
  }));
  let score: number | null = null;
  let formulaExplanation: string;
  if (available.length === 0) {
    formulaExplanation =
      "No research numbers yet — enter how many users mentioned this finding in Wawancara and/or Survey to score Desirability.";
  } else if (available.length === 1) {
    const s = available[0];
    score = s.score;
    formulaExplanation = `Only one source: D = ${s.source} ${s.score} (${s.mentions} of ${s.total} users, ${s.percent}%).`;
  } else {
    const sum = (available[0].score as number) + (available[1].score as number);
    score = Math.ceil(sum / 2);
    formulaExplanation = `D = round up average of Wawancara ${available[0].score} and Survey ${available[1].score} = (${sum} / 2) → ${score}.`;
  }
  return { score, interview, survey, formulaExplanation, inputs };
}

/**
 * Per-participant V and F (1–3 scale), the auto-calculation the user
 * defined 2026-11-07. There is NO composite score and NO averaging
 * across participants: each participant has their own V and F, and the
 * finding shows the logged-in participant's ("Me") values.
 *
 * - V = mean of the participant's non-null scores on Viability-linked
 *   aspects. Null when the participant scored no Viability aspect.
 * - F = 4 − mean of the participant's non-null scores on
 *   Feasibility-linked ("Effort") aspects. Null when the participant
 *   scored no Feasibility aspect. Higher effort means lower F:
 *   F = 3 is easiest, F = 1 is hardest.
 * - An aspect the participant has not scored is skipped, never 0.
 * - Scores are rounded to 1 decimal for display.
 */
export interface ParticipantScores {
  participantId: string;
  /** Mean of the participant's Viability aspect scores (1–3), null if none scored. */
  viability: number | null;
  /** 4 − mean of the participant's Effort aspect scores (1–3), null if none scored. */
  feasibility: number | null;
}

export function calculateParticipantScores(
  participantId: string,
  votes: Array<{ participantId: string; aspectId: string; score?: number | null }>,
  vAspectIds: string[],
  fAspectIds: string[]
): ParticipantScores {
  const meanScored = (aspectIds: string[]): number | null => {
    const ids = new Set(aspectIds);
    const scored = (votes || []).filter(
      (v) =>
        v.participantId === participantId &&
        ids.has(v.aspectId) &&
        v.score != null &&
        Number.isFinite(Number(v.score))
    );
    if (scored.length === 0) return null;
    const avg =
      scored.reduce((sum, v) => sum + Number(v.score), 0) / scored.length;
    return Number(avg.toFixed(1));
  };
  const vMean = meanScored(vAspectIds);
  const fMean = meanScored(fAspectIds);
  return {
    participantId,
    viability: vMean,
    feasibility: fMean != null ? Number((4 - fMean).toFixed(1)) : null,
  };
}

/**
 * V/F for every participant who scored at least one Viability or
 * Feasibility aspect on this finding. Participants with no scored
 * aspect in either dimension are omitted (they have no V/F to show).
 */
export function calculateAllParticipantScores(
  votes: Array<{ participantId: string; aspectId: string; score?: number | null }>,
  vAspectIds: string[],
  fAspectIds: string[]
): ParticipantScores[] {
  const ids = Array.from(new Set((votes || []).map((v) => v.participantId)));
  return ids
    .map((id) => calculateParticipantScores(id, votes, vAspectIds, fAspectIds))
    .filter((p) => p.viability != null || p.feasibility != null);
}

/** One participant's V/F out of a finding's participantScores array. */
export function scoresForParticipant(
  participantScores: ParticipantScores[] | null | undefined,
  participantId: string | null | undefined
): { viability: number | null; feasibility: number | null } {
  if (!participantId) return { viability: null, feasibility: null };
  const entry = (participantScores || []).find(
    (p) => p.participantId === participantId
  );
  return {
    viability: entry?.viability ?? null,
    feasibility: entry?.feasibility ?? null,
  };
}

/**
 * A group's V and F for a finding: the average of the V (resp. F) of
 * the given participants who scored that dimension, rounded to 1
 * decimal. A dimension no participant scored is null — never 0, and
 * never an average across participants who did not score it.
 */
export function groupAverageScores(
  participantScores: ParticipantScores[] | null | undefined,
  participantIds: string[]
): { viability: number | null; feasibility: number | null } {
  const entries = (participantScores || []).filter((p) =>
    participantIds.includes(p.participantId)
  );
  const avg = (vals: (number | null | undefined)[]) => {
    const nums = vals.filter((v): v is number => v != null);
    if (nums.length === 0) return null;
    return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
  };
  return {
    viability: avg(entries.map((e) => e.viability)),
    feasibility: avg(entries.map((e) => e.feasibility)),
  };
}

export type FeasibilityQuadrant =
  | "BIG_BETS"
  | "QUICK_WINS"
  | "AVOID"
  | "FILL_INS";

export interface FeasibilityInfo {
  x: number; // 0 to 100 (Effort: 0=High Effort, 100=Low Effort)
  y: number; // 0 to 100 (Impact: 0=Low Impact, 100=High Impact)
  quadrant: FeasibilityQuadrant;
  impactLabel: "HIGH" | "LOW";
  effortLabel: "HIGH" | "LOW";
  score: number; // 0-100 score representation
  /** The inputs blended into this score (quadrant + F-aspect validation). */
  inputs?: BlendInput[];
}

/**
 * Maps continuous X, Y coordinates to 2x2 Feasibility Quadrant
 * Top-Left: Big Bets (High Impact, High Effort => Y >= 50, X < 50)
 * Top-Right: Quick Wins (High Impact, Low Effort => Y >= 50, X >= 50)
 * Bottom-Left: Avoid (Low Impact, High Effort => Y < 50, X < 50)
 * Bottom-Right: Fill-ins (Low Impact, Low Effort => Y < 50, X >= 50)
 */
/**
 * Maps continuous X, Y coordinates to a 2x2 Feasibility Quadrant.
 *
 * Blend rule (aspect linkage): when Feasibility-linked aspects have
 * votes, their validation % is blended with the quadrant score as an
 * equal input. Pass aspectValidationScore as null when there are no
 * F-linked aspects or no votes on them — the quadrant score alone is
 * then the result.
 */
export function getFeasibilityFromCoordinates(
  x: number,
  y: number,
  aspectValidationScore?: number | null
): FeasibilityInfo {
  const clampedX = Math.max(0, Math.min(100, x));
  const clampedY = Math.max(0, Math.min(100, y));

  const isHighImpact = clampedY >= 50;
  const isLowEffort = clampedX >= 50; // Higher X = lower effort / easier to do

  let quadrant: FeasibilityQuadrant;
  let quadrantScore = 50;

  if (isHighImpact && !isLowEffort) {
    quadrant = "BIG_BETS";
    quadrantScore = 75;
  } else if (isHighImpact && isLowEffort) {
    quadrant = "QUICK_WINS";
    quadrantScore = 100;
  } else if (!isHighImpact && !isLowEffort) {
    quadrant = "AVOID";
    quadrantScore = 25;
  } else {
    quadrant = "FILL_INS";
    quadrantScore = 50;
  }

  const blended = blendDimensionInputs([
    { label: "Matrix quadrant", score: quadrantScore },
    aspectValidationScore != null
      ? { label: "Feasibility aspects validated", score: aspectValidationScore }
      : null,
  ]);

  return {
    x: clampedX,
    y: clampedY,
    quadrant,
    impactLabel: isHighImpact ? "HIGH" : "LOW",
    effortLabel: isLowEffort ? "LOW" : "HIGH",
    score: blended.score ?? quadrantScore,
    inputs: blended.inputs,
  };
}

/**
 * Impact vs Effort board position (user-defined 2026-11-07; built with
 * the current Desirability score — D's own formula is still unconfirmed
 * and will be defined later).
 *
 * - Impact (Y, 0–100) = weighted average of D and V. D is 0–100; V is
 *   1–3, normalized to 0–100 as (V−1)/2×100. Weights are equal (50/50) —
 *   the same equal split as the 33/33/33 framework weights.
 * - Effort comes from F (Feasibility, 1–3, where 3 = easiest). X =
 *   (F−1)/2×100, so F 3 → X 100 (low effort, right) and F 1 → X 0
 *   (high effort, left).
 * - A missing dimension (null) means no computed position at all.
 * - Per participant: D is shared, V and F are the viewer's own, so the
 *   board position is the viewer's own too.
 */
export interface BoardPosition {
  /** Impact 0–100 (Y), null when D or V is missing. */
  impact: number | null;
  /** Effort mapped to X 0–100 (100 = easiest), null when F is missing. */
  x: number | null;
  /** Same as impact (Y). */
  y: number | null;
  quadrant: FeasibilityQuadrant | null;
}

export function calculateBoardPosition(
  desirability: number | null | undefined,
  viability: number | null | undefined,
  feasibility: number | null | undefined
): BoardPosition {
  const d = desirability ?? null;
  const v = viability ?? null;
  const f = feasibility ?? null;
  // D and V are both 1–3: normalize each to 0–100, then average.
  // D 3 = 100, D 2 = 50, D 1 = 0 — same scale as V.
  const dNorm = d == null ? null : ((d - 1) / 2) * 100;
  const vNorm = v == null ? null : ((v - 1) / 2) * 100;
  const impact =
    dNorm == null || vNorm == null
      ? null
      : Number(((dNorm + vNorm) / 2).toFixed(1));
  const x = f == null ? null : Number((((f - 1) / 2) * 100).toFixed(1));
  const y = impact;
  let quadrant: FeasibilityQuadrant | null = null;
  if (x != null && y != null) {
    quadrant = getFeasibilityFromCoordinates(x, y).quadrant;
  }
  return { impact, x, y, quadrant };
}

/**
 * The position a finding shows on the board for a viewer: the stored
 * (pinned) position when the finding was manually placed, otherwise the
 * computed position from the viewer's own D/V/F. A finding with neither
 * a pin nor complete scores has no position (nulls) and renders unplaced.
 */
export function findingBoardPosition(
  finding: any,
  meId: string | null | undefined
): {
  x: number | null;
  y: number | null;
  quadrant: FeasibilityQuadrant | null;
  pinned: boolean;
  impact: number | null;
} {
  const pinned =
    finding?.feasibilityManual === true &&
    finding?.feasibilityX != null &&
    finding?.feasibilityY != null;
  if (pinned) {
    const quadrant = getFeasibilityFromCoordinates(
      finding.feasibilityX,
      finding.feasibilityY
    ).quadrant;
    return {
      x: finding.feasibilityX,
      y: finding.feasibilityY,
      quadrant,
      pinned: true,
      impact: finding.feasibilityY,
    };
  }
  const my = scoresForParticipant(finding?.scores?.participantScores, meId);
  const pos = calculateBoardPosition(
    finding?.scores?.desirability ?? null,
    my.viability,
    my.feasibility
  );
  return { x: pos.x, y: pos.y, quadrant: pos.quadrant, pinned: false, impact: pos.impact };
}

/**
 * Same as findingBoardPosition, but from explicit D/V/F values instead
 * of a participant id — used when the board is scoped to a whole group
 * (the group's average V/F) rather than to one viewer.
 */
export function findingBoardPositionForScores(
  finding: any,
  desirability: number | null | undefined,
  viability: number | null | undefined,
  feasibility: number | null | undefined
): {
  x: number | null;
  y: number | null;
  quadrant: FeasibilityQuadrant | null;
  pinned: boolean;
  impact: number | null;
} {
  const pinned =
    finding?.feasibilityManual === true &&
    finding?.feasibilityX != null &&
    finding?.feasibilityY != null;
  if (pinned) {
    const quadrant = getFeasibilityFromCoordinates(
      finding.feasibilityX,
      finding.feasibilityY
    ).quadrant;
    return {
      x: finding.feasibilityX,
      y: finding.feasibilityY,
      quadrant,
      pinned: true,
      impact: finding.feasibilityY,
    };
  }
  const pos = calculateBoardPosition(desirability ?? null, viability ?? null, feasibility ?? null);
  return { x: pos.x, y: pos.y, quadrant: pos.quadrant, pinned: false, impact: pos.impact };
}
