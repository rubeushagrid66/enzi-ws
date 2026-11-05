export interface WeightInput {
  name: string;
  weight: number;
}

export interface NormalizedWeight {
  name: string;
  weight: number;
  originalWeight: number;
  percentage: number;
}

/**
 * Auto-Calibration Logic for Framework Weights
 * Normalizes input weights proportionally so their sum equals exactly 100%.
 */
export function normalizeWeights(weights: WeightInput[]): NormalizedWeight[] {
  const sum = weights.reduce((acc, curr) => acc + Math.max(0, curr.weight), 0);

  if (sum === 0) {
    const equalShare = weights.length > 0 ? Number((100 / weights.length).toFixed(2)) : 0;
    return weights.map((w) => ({
      name: w.name,
      weight: equalShare,
      originalWeight: w.weight,
      percentage: equalShare,
    }));
  }

  let allocated = 0;
  return weights.map((w, index) => {
    if (index === weights.length - 1) {
      // Avoid rounding error on the last item
      const lastWeight = Number((100 - allocated).toFixed(2));
      return {
        name: w.name,
        weight: lastWeight,
        originalWeight: w.weight,
        percentage: lastWeight,
      };
    }
    const normalized = Number(((Math.max(0, w.weight) / sum) * 100).toFixed(2));
    allocated += normalized;
    return {
      name: w.name,
      weight: normalized,
      originalWeight: w.weight,
      percentage: normalized,
    };
  });
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

/**
 * Computes Desirability Score with transparent formula breakdown
 */
export function calculateDesirabilityScore(
  l1Parameters: Array<{
    id: string;
    name: string;
    scoringRules: ScoringRule[];
    subCategories: Array<{ id: string; name: string }>;
  }>,
  findingValues: Array<{ l3Id: string; l3?: { l2Id: string } }>,
  findingAttributes?: { sumber?: string[]; platform?: string[] }
): DesirabilityResult {
  if (!l1Parameters || l1Parameters.length === 0) {
    return {
      score: 0,
      l1Breakdowns: [],
      formulaExplanation: "No Level 1 parameters configured.",
    };
  }

  // Set of covered L2 sub-categories from L3 mappings
  const coveredL2Ids = new Set(
    findingValues.map((v) => v.l3?.l2Id).filter(Boolean) as string[]
  );

  const sumberNormalized = (findingAttributes?.sumber || []).map((s) =>
    s.toLowerCase().trim()
  );
  const platformNormalized = (findingAttributes?.platform || []).map((p) =>
    p.toLowerCase().trim()
  );

  const breakdowns: L1Breakdown[] = [];
  let totalNormalizedScore = 0;

  for (const l1 of l1Parameters) {
    const totalSub = l1.subCategories.length;
    const l1NameLower = l1.name.toLowerCase();
    const isSumberCategory = l1NameLower.includes("sumber") || l1NameLower.includes("source");
    const isPlatformCategory = l1NameLower.includes("platform");

    const coveredSub = l1.subCategories.filter((sub) => {
      // 1. Direct L3 value match
      if (coveredL2Ids.has(sub.id)) return true;

      const subNameLower = sub.name.toLowerCase();

      // 2. Direct Sumber match
      if (isSumberCategory && sumberNormalized.length > 0) {
        if (sumberNormalized.some((s) => subNameLower.includes(s) || s.includes(subNameLower))) {
          return true;
        }
      }

      // 3. Direct Platform match
      if (isPlatformCategory && platformNormalized.length > 0) {
        if (platformNormalized.some((p) => subNameLower.includes(p) || p.includes(subNameLower))) {
          return true;
        }
      }

      return false;
    }).length;

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
 * Computes composite DVF Score from framework weights and individual scores
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
