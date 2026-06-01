// Priority selection config — edit here to adjust weights without touching pipeline logic

export const PRIORITY_CONFIG = {
  severityWeights: {
    high:   3,
    medium: 2,
    low:    1,
  } as Record<string, number>,

  // Base group multipliers (language_use can be boosted to 2.0 if affects_meaning=true)
  groupMultipliers: {
    main_idea_coverage: 2.0,  // content macro
    condensation:       2.0,  // content macro
    content_accuracy:   2.0,  // content macro
    paraphrasing:       2.0,  // content micro
    organization:       1.0,  // content task-specific
    language_use:       1.0,  // language
  } as Record<string, number>,

  // Tie-break order (lower index = higher priority when scores are equal)
  tieBreakOrder: [
    'main_idea_coverage',
    'condensation',
    'content_accuracy',
    'paraphrasing',
    'organization',
    'language_use',
  ] as string[],
} as const;
