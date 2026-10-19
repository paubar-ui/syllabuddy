// What do I need on the rest of the course to reach my target? (CLAUDE.md §5.3)
// Assumes the same score on every remaining component.

export interface GradeComponent {
  weight: number; // % of final grade
  score?: number | null; // on the course scale, once known
}

export interface RequiredScore {
  /** Average needed on the remaining components (0 if already secured). */
  needed: number;
  possible: boolean;
  alreadySecured: boolean;
  /** Weighted average of the scores you already have, or null if none yet. */
  currentAverage: number | null;
  /** Best final grade still reachable (full marks on everything left). */
  maxReachable: number;
  remainingWeight: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const hasScore = (c: GradeComponent): c is GradeComponent & { score: number } =>
  typeof c.score === "number" && Number.isFinite(c.score);

export function requiredScore(components: GradeComponent[], targetGrade: number, scale: number): RequiredScore {
  // Weights that don't add up to 100 are treated proportionally.
  const totalWeight = components.reduce((s, c) => s + c.weight, 0) || 1;
  const graded = components.filter(hasScore);
  const gradedWeight = graded.reduce((s, c) => s + c.weight, 0);
  const earned = graded.reduce((s, c) => s + c.weight * c.score, 0);
  const remainingWeight = totalWeight - gradedWeight;

  const currentAverage = gradedWeight > 0 ? round2(earned / gradedWeight) : null;
  const maxReachable = round2((earned + scale * remainingWeight) / totalWeight);
  const finalIfZero = earned / totalWeight;

  if (remainingWeight <= 0) {
    const reached = finalIfZero >= targetGrade - 1e-9;
    return {
      needed: 0,
      possible: reached,
      alreadySecured: reached,
      currentAverage,
      maxReachable,
      remainingWeight: 0,
    };
  }

  const needed = (targetGrade * totalWeight - earned) / remainingWeight;
  return {
    needed: round2(Math.max(0, needed)),
    possible: needed <= scale + 1e-9,
    alreadySecured: needed <= 0,
    currentAverage,
    maxReachable,
    remainingWeight: round2(remainingWeight),
  };
}
