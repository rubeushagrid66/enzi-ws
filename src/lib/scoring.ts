export interface WeightInput {
  name: string;
  weight: number;
}

export interface ScoringRule {
  minPercent: number; // e.g., 66, 33, 0
  score: number;      // e.g., 3, 2, 1
  label?: string;
}

export interface L1Breakdown {
  l1Id: string;
  l1Name: string;
  totalSubcategories: number;
  coveredSubcategories: number;
  coveragePercent: number;
  matchedRule: ScoringRule | null;
  score: number; // Normalized 0-100
  maxScore: number;
}

export interface DesirabilityResult {
  score: number; // 0-100
  l1Breakdowns: L1Breakdown[];
  formulaExplanation: string;
  /** The inputs that were blended into this score (see blend rule). */
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
 * produced data for it: an explicit L3 mapping or a vote on a
 * Desirability-linked aspect (Desirability), a vote on a
 * Viability-linked aspect (Viability), or a vote on a
 * Feasibility-linked aspect (Feasibility). A finding with no workshop
 * data is Unscored. Note: placing a card on the 2x2 board does NOT
 * score Feasibility — F comes only from Feasibility aspect votes.
 */
export function getFindingScoringStatus(
  finding: {
    parameterValues?: Array<any> | null;
    viabilityVotes?: Array<any> | null;
    feasibilityX?: number | null;
    feasibilityY?: number | null;
  },
  aspects?: Array<{ id: string; framework?: any }> | null
): FindingScoringStatus {
  const votes = finding.viabilityVotes ?? [];
  let desirabilityScored = (finding.parameterValues?.length ?? 0) > 0;
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
    const dIds = idsFor("Desirability");
    const vIds = idsFor("Viability");
    const fIds = idsFor("Feasibility");
    if (votes.some((v: any) => dIds.has(v.aspectId))) desirabilityScored = true;
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
 * Computes Desirability Score with transparent formula breakdown.
 *
 * Workshop-only scoring: coverage comes ONLY from explicit L3 parameter
 * mappings made in the workshop (findingValues). The finding's
 * Sumber/Platform attributes are display tags, not score inputs — a
 * finding must be mapped to L3 segments by the workshop group before it
 * can have a Desirability score.
 *
 * Blend rule (aspect linkage): when Desirability-linked aspects have
 * votes, their validation % is blended with the L3-mapping score as an
 * equal input (average of the available inputs). Pass
 * aspectValidationScore as null when there are no D-linked aspects or
 * no votes on them — the mapping score alone is then the result.
 */
export function calculateDesirabilityScore(
  l1Parameters: Array<{
    id: string;
    name: string;
    scoringRules: ScoringRule[];
    subCategories: Array<{ id: string; name: string }>;
  }>,
  findingValues: Array<{ l3Id: string; l3?: { l2Id: string } }>,
  aspectValidationScore?: number | null
): DesirabilityResult {
  if (!l1Parameters || l1Parameters.length === 0) {
    const blended = blendDimensionInputs([
      aspectValidationScore != null
        ? { label: "Desirability aspects validated", score: aspectValidationScore }
        : null,
    ]);
    return {
      score: blended.score ?? 0,
      l1Breakdowns: [],
      formulaExplanation:
        blended.inputs.length > 0
          ? `No Level 1 parameters configured — Desirability from aspects only: ${blended.inputs.map((i) => `${i.label} ${i.score}`).join(" · ")} = ${blended.score}`
          : "No Level 1 parameters configured.",
      inputs: blended.inputs,
    };
  }

  // Set of covered L2 sub-categories from explicit L3 mappings only.
  const coveredL2Ids = new Set(
    findingValues.map((v) => v.l3?.l2Id).filter(Boolean) as string[]
  );

  const breakdowns: L1Breakdown[] = [];
  let totalNormalizedScore = 0;

  for (const l1 of l1Parameters) {
    const totalSub = l1.subCategories.length;

    const coveredSub = l1.subCategories.filter((sub) =>
      coveredL2Ids.has(sub.id)
    ).length;

    const coveragePercent =
      totalSub > 0 ? Number(((coveredSub / totalSub) * 100).toFixed(1)) : 0;

    // Sort rules descending by minPercent
    const sortedRules = [...(l1.scoringRules || [])].sort(
      (a, b) => b.minPercent - a.minPercent
    );

    let matched: ScoringRule | null = null;
    for (const rule of sortedRules) {
      if (coveragePercent >= rule.minPercent) {
        matched = rule;
        break;
      }
    }

    const maxRuleScore = sortedRules.length > 0 ? Math.max(...sortedRules.map((r) => r.score)) : 3;
    const rawScore = matched ? matched.score : 0;
    const normalizedScore = maxRuleScore > 0 ? (rawScore / maxRuleScore) * 100 : 0;

    totalNormalizedScore += normalizedScore;

    breakdowns.push({
      l1Id: l1.id,
      l1Name: l1.name,
      totalSubcategories: totalSub,
      coveredSubcategories: coveredSub,
      coveragePercent,
      matchedRule: matched,
      score: Number(normalizedScore.toFixed(1)),
      maxScore: 100,
    });
  }

  const mappingScore = Number(
    (totalNormalizedScore / l1Parameters.length).toFixed(1)
  );

  const explanation = breakdowns
    .map(
      (b) =>
        `[${b.l1Name}: ${b.coveredSubcategories}/${b.totalSubcategories} (${b.coveragePercent}%) -> Score ${b.score}/100]`
    )
    .join(" + ");

  // Blend the L3-mapping score with D-linked aspect validation, when
  // the workshop recorded votes on Desirability-linked aspects. No
  // mappings means no mapping input at all — an empty mapping must not
  // contribute a phantom score to the blend.
  const blended = blendDimensionInputs([
    findingValues.length > 0
      ? { label: "L3 mapping", score: mappingScore }
      : null,
    aspectValidationScore != null
      ? { label: "Desirability aspects validated", score: aspectValidationScore }
      : null,
  ]);
  const inputsText = blended.inputs
    .map((i) => `${i.label} ${i.score}`)
    .join(" · ");
  const blendNote =
    blended.inputs.length > 1
      ? ` Blend (average of ${blended.inputs.length} inputs): ${inputsText} = ${blended.score}`
      : "";

  return {
    score: blended.score ?? mappingScore,
    l1Breakdowns: breakdowns,
    formulaExplanation: `Average of categories: (${explanation}) / ${breakdowns.length} = ${mappingScore}.${blendNote}`,
    inputs: blended.inputs,
  };
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

export interface AspectValidation {
  /** Validation % across the given aspects (participants x aspects). */
  score: number;
  totalPossibleVotes: number;
  totalValidatedVotes: number;
  groupBreakdown: Array<{
    groupId: string;
    groupName: string;
    validatedVotes: number;
    possibleVotes: number;
    percentage: number;
  }>;
  /** True once any vote row exists for these aspects (validated or not). */
  hasVotes: boolean;
}

/**
 * Validation % for one set of linked aspects (e.g. all Desirability-
 * linked aspects). Returns null when there are no aspects in the set or
 * no votes recorded on them yet — an unvoted aspect input is unavailable,
 * not 0, so it never drags a blended score down.
 */
export function calculateAspectValidation(
  aspectIds: string[],
  groups: Array<{
    id: string;
    name: string;
    participants: Array<{ id: string; name: string }>;
  }>,
  votes: Array<{ participantId: string; aspectId: string; isValidated: boolean }>
): AspectValidation | null {
  if (!aspectIds || aspectIds.length === 0) return null;
  const ids = new Set(aspectIds);
  const relevant = (votes || []).filter((v) => ids.has(v.aspectId));
  if (relevant.length === 0) return null;

  const activeVotes = relevant.filter((v) => v.isValidated);
  let grandTotalPossible = 0;
  let grandTotalValidated = 0;

  const groupBreakdown = groups.map((g) => {
    const participantsCount = g.participants.length;
    const possible = participantsCount * aspectIds.length;
    let validated = 0;
    for (const p of g.participants) {
      for (const v of activeVotes) {
        if (v.participantId === p.id) validated++;
      }
    }
    grandTotalPossible += possible;
    grandTotalValidated += validated;
    return {
      groupId: g.id,
      groupName: g.name,
      validatedVotes: validated,
      possibleVotes: possible,
      percentage:
        possible > 0 ? Number(((validated / possible) * 100).toFixed(1)) : 0,
    };
  });

  return {
    score:
      grandTotalPossible > 0
        ? Number(((grandTotalValidated / grandTotalPossible) * 100).toFixed(1))
        : 0,
    totalPossibleVotes: grandTotalPossible,
    totalValidatedVotes: grandTotalValidated,
    groupBreakdown,
    hasVotes: true,
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
  const vNorm = v == null ? null : ((v - 1) / 2) * 100;
  const impact =
    d == null || vNorm == null
      ? null
      : Number(((d + vNorm) / 2).toFixed(1));
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
