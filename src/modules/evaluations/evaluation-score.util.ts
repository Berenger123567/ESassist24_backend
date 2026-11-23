export interface ScoredCriterion {
  id: string;
  weight: number;
  active: boolean;
}

export interface SubmittedScore {
  criterionId: string;
  score: number;
}

export interface ScoreComputation {
  score: number;
  missingCriterionIds: string[];
  invalidCriterionIds: string[];
  invalidScoreIds: string[];
}

export function calculateEvaluationScore(
  criteria: ScoredCriterion[],
  results: SubmittedScore[],
): ScoreComputation {
  const activeCriteria = criteria.filter((criterion) => criterion.active);
  const activeById = new Map(activeCriteria.map((criterion) => [criterion.id, criterion]));
  const knownIds = new Set(criteria.map((criterion) => criterion.id));
  const lastResultByCriterion = new Map<string, number>();
  for (const result of results) {
    lastResultByCriterion.set(result.criterionId, result.score);
  }

  const missingCriterionIds = activeCriteria
    .filter((criterion) => !lastResultByCriterion.has(criterion.id))
    .map((criterion) => criterion.id);
  const invalidCriterionIds = results
    .filter((result) => !knownIds.has(result.criterionId))
    .map((result) => result.criterionId);
  const invalidScoreIds = results
    .filter((result) => {
      const criterion = activeById.get(result.criterionId);
      return criterion ? result.score < 0 || result.score > criterion.weight : false;
    })
    .map((result) => result.criterionId);

  const score = Math.min(
    100,
    activeCriteria.reduce((total, criterion) => {
      const value = lastResultByCriterion.get(criterion.id) ?? 0;
      return total + Math.max(0, Math.min(value, criterion.weight));
    }, 0),
  );

  return {
    score,
    missingCriterionIds: [...new Set(missingCriterionIds)],
    invalidCriterionIds: [...new Set(invalidCriterionIds)],
    invalidScoreIds: [...new Set(invalidScoreIds)],
  };
}

export function hasDuplicateIds(ids: string[]): boolean {
  return new Set(ids).size !== ids.length;
}
