export const PHASES = [
  'pretest',
  'cycle1_draft', 'cycle1_da', 'cycle1_revision',
  'cycle2_draft', 'cycle2_da', 'cycle2_revision',
  'cycle3_draft', 'cycle3_da', 'cycle3_revision',
  'posttest',
] as const;

export type Phase = typeof PHASES[number];

export const PHASE_LABEL: Record<Phase, string> = {
  pretest: '프리테스트',
  cycle1_draft: 'C1 드래프트',
  cycle1_da: 'C1 동적평가',
  cycle1_revision: 'C1 리비전',
  cycle2_draft: 'C2 드래프트',
  cycle2_da: 'C2 동적평가',
  cycle2_revision: 'C2 리비전',
  cycle3_draft: 'C3 드래프트',
  cycle3_da: 'C3 동적평가',
  cycle3_revision: 'C3 리비전',
  posttest: '포스트테스트',
};

export const PHASE_GROUPS = [
  { key: 'pretest',  label: '프리테스트',  phases: ['pretest'] as Phase[] },
  { key: 'cycle1',  label: '사이클 1',    phases: ['cycle1_draft', 'cycle1_da', 'cycle1_revision'] as Phase[] },
  { key: 'cycle2',  label: '사이클 2',    phases: ['cycle2_draft', 'cycle2_da', 'cycle2_revision'] as Phase[] },
  { key: 'cycle3',  label: '사이클 3',    phases: ['cycle3_draft', 'cycle3_da', 'cycle3_revision'] as Phase[] },
  { key: 'posttest', label: '포스트테스트', phases: ['posttest'] as Phase[] },
];

export function nextPhase(p: Phase): Phase {
  const idx = PHASES.indexOf(p);
  return idx < PHASES.length - 1 ? PHASES[idx + 1] : p;
}

export function prevPhase(p: Phase): Phase {
  const idx = PHASES.indexOf(p);
  return idx > 0 ? PHASES[idx - 1] : p;
}

export function isBlankPhase(p: string): boolean {
  return p === 'pretest' || p === 'posttest' || p.endsWith('_revision');
}

export function isDraftPhase(p: string): boolean {
  return p.endsWith('_draft');
}

export function isDAPhase(p: string): boolean {
  return p.endsWith('_da');
}

export function cycleKeyFromPhase(p: string): string {
  return p.replace('_draft', '').replace('_da', '').replace('_revision', '');
}

export function isValidPhase(p: string): p is Phase {
  return (PHASES as readonly string[]).includes(p);
}

export function getSubmitLabel(phase: string): string {
  if (phase === 'cycle1_revision') return '사이클 1 종료';
  if (phase === 'cycle2_revision') return '사이클 2 종료';
  if (phase === 'cycle3_revision') return '사이클 3 종료';
  if (phase === 'posttest') return '완료';
  return '제출';
}
