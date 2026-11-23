import { calculateEvaluationScore, hasDuplicateIds } from './evaluation-score.util';

describe('calculateEvaluationScore', () => {
  const criteria = [
    { id: 'a', weight: 30, active: true },
    { id: 'b', weight: 70, active: true },
  ];

  it('calcule le score pondéré plafonné à 100', () => {
    const result = calculateEvaluationScore(criteria, [
      { criterionId: 'a', score: 30 },
      { criterionId: 'b', score: 55 },
    ]);
    expect(result).toEqual({
      score: 85,
      missingCriterionIds: [],
      invalidCriterionIds: [],
      invalidScoreIds: [],
    });
  });

  it('signale les critères actifs non évalués', () => {
    const result = calculateEvaluationScore(criteria, [{ criterionId: 'a', score: 30 }]);
    expect(result.score).toBe(30);
    expect(result.missingCriterionIds).toEqual(['b']);
  });

  it('signale les critères inconnus et les scores hors bornes', () => {
    const result = calculateEvaluationScore(criteria, [
      { criterionId: 'a', score: 45 },
      { criterionId: 'unknown', score: 10 },
    ]);
    expect(result.invalidScoreIds).toEqual(['a']);
    expect(result.invalidCriterionIds).toEqual(['unknown']);
  });

  it('ignore les critères inactifs', () => {
    const result = calculateEvaluationScore(
      [
        { id: 'a', weight: 40, active: true },
        { id: 'b', weight: 60, active: false },
      ],
      [{ criterionId: 'a', score: 40 }],
    );
    expect(result.score).toBe(40);
    expect(result.missingCriterionIds).toEqual([]);
  });
});

describe('hasDuplicateIds', () => {
  it('détecte les doublons', () => {
    expect(hasDuplicateIds(['a', 'b', 'a'])).toBe(true);
    expect(hasDuplicateIds(['a', 'b'])).toBe(false);
  });
});
