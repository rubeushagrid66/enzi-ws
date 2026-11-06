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
}

export type ScoringDimension = "Desirability" | "Viability" | "Feasibility";

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
 * produced data for it: an explicit L3 mapping (Desirability), at least
 * one viability vote (Viability), or a placed matrix position
 * (Feasibility). A finding with no workshop data is Unscored.
 */
export function getFindingScoringStatus(finding: {
  parameterValues?: Array<any> | null;
  viabilityVotes?: Array<any> | null;
  feasibilityX?: number | null;
  feasibilityY?: number | null;
}): FindingScoringStatus {
  const desirabilityScored = (finding.parameterValues?.length ?? 0) > 0;
  const viabilityScored = (finding.viabilityVotes?.length ?? 0) > 0;
  const feasibilityScored =
    finding.feasibilityX != null && finding.feasibilityY != null;
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
 */
export function calculateDesirabilityScore(
  l1Parameters: Array<{
    id: string;
    name: string;
    scoringRules: ScoringRule[];
    subCategories: Array<{ id: string; name: string }>;
  }>,
  findingValues: Array<{ l3Id: string; l3?: { l2Id: string } }>
): DesirabilityResult {
  if (!l1Parameters || l1Parameters.length === 0) {
    return {
      score: 0,
      l1Breakdowns: [],
      formulaExplanation: "No Level 1 parameters configured.",
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

  const finalScore = Number(
    (totalNormalizedScore / l1Parameters.length).toFixed(1)
  );

  const explanation = breakdowns
    .map(
      (b) =>
        `[${b.l1Name}: ${b.coveredSubcategories}/${b.totalSubcategories} (${b.coveragePercent}%) -> Score ${b.score}/100]`
    )
    .join(" + ");

  return {
    score: finalScore,
    l1Breakdowns: breakdowns,
    formulaExplanation: `Average of categories: (${explanation}) / ${breakdowns.length} = ${finalScore}`,
  };
}

export interface ViabilityVoteSummary {
  participantId: string;
  participantName: string;
  groupId: string;
  groupName: string;
  validatedAspectIds: string[];
}

export interface ViabilityResult {
  score: number; // 0-100%
  totalPossibleVotes: number;
  totalValidatedVotes: number;
  groupBreakdown: Array<{
    groupId: string;
    groupName: string;
    validatedVotes: number;
    possibleVotes: number;
    percentage: number;
  }>;
}

/**
 * Computes Viability Score from participant validation matrix
 */
export function calculateViabilityScore(
  totalAspectsCount: number,
  groups: Array<{
    id: string;
    name: string;
    participants: Array<{ id: string; name: string }>;
  }>,
  votes: Array<{ participantId: string; aspectId: string; isValidated: boolean }>
): ViabilityResult {
  const activeVotes = votes.filter((v) => v.isValidated);
  const validatedVoteSet = new Set(
    activeVotes.map((v) => `${v.participantId}:${v.aspectId}`)
  );

  let grandTotalPossible = 0;
  let grandTotalValidated = 0;

  const groupBreakdown = groups.map((g) => {
    const participantsCount = g.participants.length;
    const possible = participantsCount * totalAspectsCount;
    let validated = 0;

    for (const p of g.participants) {
      for (const v of activeVotes) {
        if (v.participantId === p.id) {
          validated++;
        }
      }
    }

    grandTotalPossible += possible;
    grandTotalValidated += validated;

    const percentage =
      possible > 0 ? Number(((validated / possible) * 100).toFixed(1)) : 0;

    return {
      groupId: g.id,
      groupName: g.name,
      validatedVotes: validated,
      possibleVotes: possible,
      percentage,
    };
  });

  const overallScore =
    grandTotalPossible > 0
      ? Number(((grandTotalValidated / grandTotalPossible) * 100).toFixed(1))
      : 0;

  return {
    score: overallScore,
    totalPossibleVotes: grandTotalPossible,
    totalValidatedVotes: grandTotalValidated,
    groupBreakdown,
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
}

/**
 * Maps continuous X, Y coordinates to 2x2 Feasibility Quadrant
 * Top-Left: Big Bets (High Impact, High Effort => Y >= 50, X < 50)
 * Top-Right: Quick Wins (High Impact, Low Effort => Y >= 50, X >= 50)
 * Bottom-Left: Avoid (Low Impact, High Effort => Y < 50, X < 50)
 * Bottom-Right: Fill-ins (Low Impact, Low Effort => Y < 50, X >= 50)
 */
export function getFeasibilityFromCoordinates(x: number, y: number): FeasibilityInfo {
  const clampedX = Math.max(0, Math.min(100, x));
  const clampedY = Math.max(0, Math.min(100, y));

  const isHighImpact = clampedY >= 50;
  const isLowEffort = clampedX >= 50; // Higher X = lower effort / easier to do

  let quadrant: FeasibilityQuadrant;
  let score = 50;

  if (isHighImpact && !isLowEffort) {
    quadrant = "BIG_BETS";
    score = 75;
  } else if (isHighImpact && isLowEffort) {
    quadrant = "QUICK_WINS";
    score = 100;
  } else if (!isHighImpact && !isLowEffort) {
    quadrant = "AVOID";
    score = 25;
  } else {
    quadrant = "FILL_INS";
    score = 50;
  }

  return {
    x: clampedX,
    y: clampedY,
    quadrant,
    impactLabel: isHighImpact ? "HIGH" : "LOW",
    effortLabel: isLowEffort ? "LOW" : "HIGH",
    score,
  };
}

/**
 * Computes composite DVF Score from framework weights and individual scores.
 * Weights are used exactly as entered — they are NOT normalized to 100.
 * If the weights total 100, the composite is out of 100; otherwise it
 * scales with the total (e.g. weights totalling 120 can give up to 120).
 */
export function calculateCompositeDVF(
  weights: { desirability: number; viability: number; feasibility: number },
  scores: { desirability: number; viability: number; feasibility: number }
): {
  compositeScore: number;
  formula: string;
} {
  const dWeight = weights.desirability / 100;
  const vWeight = weights.viability / 100;
  const fWeight = weights.feasibility / 100;

  const total =
    scores.desirability * dWeight +
    scores.viability * vWeight +
    scores.feasibility * fWeight;

  const rounded = Number(total.toFixed(1));
  const formula = `(${weights.desirability}% * ${scores.desirability}) + (${weights.viability}% * ${scores.viability}) + (${weights.feasibility}% * ${scores.feasibility}) = ${rounded}`;

  return {
    compositeScore: rounded,
    formula,
  };
}
