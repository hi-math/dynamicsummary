// 평가 항목(6종)과 descriptor(16종) — 진단·중재의 공통 기준.
//
// 원천은 prompt_assets 의 `descriptors` 행(JSON)이며 관리 화면의 '평가 기준' 탭에서 편집한다.
// 값이 없거나 깨졌으면 src/data/descriptors.json 을 폴백으로 쓴다.
//
// 이 기준은 프롬프트 본문에 복사해 두지 않고, 호출할 때 코드가 블록으로 붙인다:
//   Assessor            → 6항목 전체 (무엇을 고를지 판단해야 하므로)
//   Analysis / 중재 발화 → 현재 항목 하나만 (다른 항목의 기준을 끌어오지 않도록)

import fallback from '@/data/descriptors.json';

export type DescriptorDef = {
  key: string;
  description: string;   // 이 descriptor 가 무엇인지
  detection: string;     // 탐지 지침 (여러 줄, 보통 '- ' 목록)
};

export type ItemDef = {
  key: string;
  label: string;         // 관리 화면 표시용 (프롬프트에는 넣지 않는다)
  coreQuestion: string;  // 이 항목이 묻는 핵심 질문
  descriptors: DescriptorDef[];
};

export const DESCRIPTORS_ASSET_KEY = 'descriptors';

const FALLBACK_ITEMS = (fallback as { items: ItemDef[] }).items;

/** JSON 문자열 → 항목 목록. 비어 있거나 파싱 실패면 폴백. */
export function parseItems(raw: string | undefined | null): ItemDef[] {
  if (raw?.trim()) {
    try {
      const parsed = JSON.parse(raw) as ItemDef[] | { items?: ItemDef[] };
      const items = Array.isArray(parsed) ? parsed : parsed.items;
      if (Array.isArray(items) && items.length) return items;
    } catch { /* 폴백으로 */ }
  }
  return FALLBACK_ITEMS;
}

export function itemsFrom(prompts: Record<string, string>): ItemDef[] {
  return parseItems(prompts[DESCRIPTORS_ASSET_KEY]);
}

export function serializeItems(items: ItemDef[]): string {
  return JSON.stringify({ items }, null, 2);
}

/** 프롬프트에 넣을 마크다운. 관리 화면에서 편집한 내용이 그대로 나간다. */
function renderItem(item: ItemDef, heading: '##' | '###'): string {
  const sub = `${heading}#`;
  const core = item.coreQuestion.trim()
    ? `\n\n**Core question:** ${item.coreQuestion.trim()}`
    : '';
  const body = item.descriptors
    .map((d) => {
      const desc = d.description.trim();
      const det = d.detection.trim();
      return [
        `${sub} \`${d.key}\``,
        desc && `\n\n${desc}`,
        det && `\n\nDetection guidance:\n${det}`,
      ].filter(Boolean).join('');
    })
    .join('\n\n');
  return `${heading} \`${item.key}\`${core}${body ? `\n\n${body}` : ''}`;
}

/** Assessor 용 — 6항목 전체. */
export function descriptorBlockAll(items: ItemDef[]): string {
  const total = items.reduce((n, i) => n + i.descriptors.length, 0);
  return `## Assessment framework

The ${items.length} assessment items are the units of evaluation and target selection.
The ${total} descriptors under each item are internal diagnostic criteria for evaluating that
item. Select mediation targets from the assessment items, not from the descriptors.

When several descriptor-defined problems occur within one item, evaluate them internally but
identify one primary mediation problem if the item is selected.

${items.map((i) => renderItem(i, '###')).join('\n\n')}`;
}

/** 판정·중재 턴 용 — 현재 항목 하나만. 없으면 빈 문자열. */
export function descriptorBlockFor(items: ItemDef[], itemKey: string): string {
  const item = items.find((i) => i.key === itemKey);
  if (!item) return '';
  return `## Assessment criteria for the current item

These are the diagnostic criteria behind the current item. Use them to keep the interaction
anchored to this item. Do not introduce criteria from other items, and never read descriptor
names or this framework out to the learner.

${renderItem(item, '##')}`;
}
