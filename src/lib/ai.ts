import type { APISettings, Prompts } from '@/types';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function buildSystemPrompt(prompts: Prompts, passageContent: string, summary: string): string {
  return `${prompts.system_prompt}

---
[현재 지문]
${passageContent}

[학생의 요약문]
${summary}`;
}

async function callOpenAI(
  messages: ChatMessage[],
  systemPrompt: string,
  api: APISettings,
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${api.openai_key}`,
    },
    body: JSON.stringify({
      model: api.openai_model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error: ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content as string;
}

async function callAnthropic(
  messages: ChatMessage[],
  systemPrompt: string,
  api: APISettings,
): Promise<string> {
  // Anthropic API has CORS restrictions in browser environments.
  // This function is intended for server-side use only (Next.js Server Actions).
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': api.anthropic_key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: api.anthropic_model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic error: ${err}`);
  }
  const data = await res.json();
  return data.content[0].text as string;
}

async function callGemini(
  messages: ChatMessage[],
  systemPrompt: string,
  api: APISettings,
): Promise<string> {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${api.gemini_model}:generateContent?key=${api.gemini_key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error: ${err}`);
  }
  const data = await res.json();
  return data.candidates[0].content.parts[0].text as string;
}

// Single-node call with an arbitrary system prompt (used by DA pipeline)
export async function callLLMNode(
  systemPrompt: string,
  userInput: string,
  api: APISettings,
): Promise<string> {
  const messages: ChatMessage[] = [{ role: 'user', content: userInput }];
  switch (api.provider) {
    case 'openai':    return callOpenAI(messages, systemPrompt, api);
    case 'anthropic': return callAnthropic(messages, systemPrompt, api);
    case 'gemini':    return callGemini(messages, systemPrompt, api);
    default: throw new Error(`Unknown provider: ${api.provider}`);
  }
}

export async function callAI(
  messages: ChatMessage[],
  passageContent: string,
  summary: string,
  prompts: Prompts,
  api: APISettings,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(prompts, passageContent, summary);

  switch (api.provider) {
    case 'openai':
      return callOpenAI(messages, systemPrompt, api);
    case 'anthropic':
      return callAnthropic(messages, systemPrompt, api);
    case 'gemini':
      return callGemini(messages, systemPrompt, api);
    default:
      throw new Error(`Unknown provider: ${api.provider}`);
  }
}
