export const PHASES = [
  'cycle1_draft', 'cycle1_comprehension', 'cycle1_da',
  'cycle2_draft', 'cycle2_comprehension', 'cycle2_da',
  'cycle3_draft', 'cycle3_comprehension', 'cycle3_da',
  'cycle4_draft', 'cycle4_comprehension', 'cycle4_da',
] as const;

export type Phase = typeof PHASES[number];

export const PHASE_LABEL: Record<Phase, string> = {
  cycle1_draft:         'C1 드래프트',
  cycle1_comprehension: 'C1 이해도검사',
  cycle1_da:            'C1 동적평가',
  cycle2_draft:         'C2 드래프트',
  cycle2_comprehension: 'C2 이해도검사',
  cycle2_da:            'C2 동적평가',
  cycle3_draft:         'C3 드래프트',
  cycle3_comprehension: 'C3 이해도검사',
  cycle3_da:            'C3 동적평가',
  cycle4_draft:         'C4 드래프트',
  cycle4_comprehension: 'C4 이해도검사',
  cycle4_da:            'C4 동적평가',
};

export const STAGE_SHORT: Record<string, string> = {
  _draft:         '드래프트',
  _comprehension: '이해도검사',
  _da:            '동적평가',
};

export const PHASE_GROUPS = [
  { key: 'cycle1', label: '사이클 1', phases: ['cycle1_draft','cycle1_comprehension','cycle1_da'] as Phase[] },
  { key: 'cycle2', label: '사이클 2', phases: ['cycle2_draft','cycle2_comprehension','cycle2_da'] as Phase[] },
  { key: 'cycle3', label: '사이클 3', phases: ['cycle3_draft','cycle3_comprehension','cycle3_da'] as Phase[] },
  { key: 'cycle4', label: '사이클 4', phases: ['cycle4_draft','cycle4_comprehension','cycle4_da'] as Phase[] },
];

export function nextPhase(p: Phase): Phase {
  const idx = PHASES.indexOf(p);
  return idx < PHASES.length - 1 ? PHASES[idx + 1] : p;
}

export function prevPhase(p: Phase): Phase {
  const idx = PHASES.indexOf(p);
  return idx > 0 ? PHASES[idx - 1] : p;
}

export function isDraftPhase(p: string): boolean        { return p.endsWith('_draft'); }
export function isComprehensionPhase(p: string): boolean { return p.endsWith('_comprehension'); }
export function isDAPhase(p: string): boolean            { return p.endsWith('_da'); }

export function cycleKeyFromPhase(p: string): string {
  return p
    .replace('_draft', '')
    .replace('_comprehension', '')
    .replace('_da', '');
}

export function isValidPhase(p: string): p is Phase {
  return (PHASES as readonly string[]).includes(p);
}

export function stageShortLabel(phase: string): string {
  for (const [suffix, label] of Object.entries(STAGE_SHORT)) {
    if (phase.endsWith(suffix)) return label;
  }
  return '';
}

export function getSubmitLabel(phase: string): string {
  void phase;
  return '제출';
}
