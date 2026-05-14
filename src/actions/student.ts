'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { callAI } from '@/lib/ai';
import { nextPhase } from '@/lib/phases';
import type { APISettings, Prompts, SessionData, AIMessage, Phase } from '@/types';

// ─── Session data ─────────────────────────────────────────────────────────────

export async function getSessionData(studentId: string, phase: string): Promise<SessionData | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('session_data')
    .select('*')
    .eq('student_id', studentId)
    .eq('phase', phase)
    .single();
  return data as SessionData | null;
}

export async function saveNotes(studentId: string, phase: string, notes: string) {
  const supabase = createServerClient();
  await supabase.from('session_data').upsert(
    { student_id: studentId, phase, notes, updated_at: new Date().toISOString() },
    { onConflict: 'student_id,phase' },
  );
}

export async function saveSummary(studentId: string, phase: string, summary: string) {
  const supabase = createServerClient();
  await supabase.from('session_data').upsert(
    { student_id: studentId, phase, summary, updated_at: new Date().toISOString() },
    { onConflict: 'student_id,phase' },
  );
}

// ─── Draft submit ─────────────────────────────────────────────────────────────

export async function submitDraft(studentId: string, phase: string, summary: string) {
  const supabase = createServerClient();
  const { error } = await supabase.from('session_data').upsert(
    {
      student_id: studentId,
      phase,
      summary,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,phase' },
  );
  if (error) return { error: error.message };
  revalidatePath('/student');
  return { success: true };
}

// ─── Passage ──────────────────────────────────────────────────────────────────

export async function getPassage(cycleKey: string) {
  const supabase = createServerClient();
  const { data } = await supabase.from('passages').select('*').eq('cycle_key', cycleKey).single();
  return data;
}

export async function getCurrentUser(studentId: string) {
  const supabase = createServerClient();
  const { data } = await supabase.from('users').select('*').eq('id', studentId).single();
  return data;
}

export async function studentAdvancePhase(studentId: string) {
  const supabase = createServerClient();
  const { data: user } = await supabase.from('users').select('current_phase').eq('id', studentId).single();
  if (!user) return { error: '사용자를 찾을 수 없습니다.' };

  const current = user.current_phase as Phase;
  const next = nextPhase(current);
  if (next === current) return { success: true };

  const { error } = await supabase.from('users').update({ current_phase: next }).eq('id', studentId);
  if (error) return { error: error.message };

  revalidatePath('/student');
  return { success: true };
}

// ─── AI Chat ──────────────────────────────────────────────────────────────────

export async function getAIMessages(studentId: string, phase: string): Promise<AIMessage[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('ai_messages')
    .select('*')
    .eq('student_id', studentId)
    .eq('phase', phase)
    .order('created_at', { ascending: true });
  return (data ?? []) as AIMessage[];
}

export async function submitToAI(
  studentId: string,
  phase: string,
  summary: string,
  passageContent: string,
): Promise<{ reply?: string; error?: string }> {
  const supabase = createServerClient();

  const [apiRes, promptsRes] = await Promise.all([
    supabase.from('api_settings').select('*').eq('id', 1).single<APISettings>(),
    supabase.from('prompts').select('*').eq('id', 1).single<Prompts>(),
  ]);

  if (!apiRes.data || !promptsRes.data) return { error: 'API 설정이 없습니다.' };
  if (!apiRes.data.openai_key && !apiRes.data.anthropic_key && !apiRes.data.gemini_key) {
    return { error: 'API 키가 설정되지 않았습니다.' };
  }

  const api = apiRes.data;
  const prompts = promptsRes.data;

  // Save summary and mark submitted
  await supabase.from('session_data').upsert(
    {
      student_id: studentId,
      phase,
      summary,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,phase' },
  );

  // First AI message is the DA prompt
  const userMessage = { role: 'user' as const, content: prompts.da_prompt };

  try {
    const reply = await callAI([userMessage], passageContent, summary, prompts, api);

    await supabase.from('ai_messages').insert([
      { student_id: studentId, phase, role: 'user', content: prompts.da_prompt },
      { student_id: studentId, phase, role: 'assistant', content: reply },
    ]);

    return { reply };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'AI 호출 실패' };
  }
}

export async function sendAIMessage(
  studentId: string,
  phase: string,
  userContent: string,
  passageContent: string,
  summary: string,
): Promise<{ reply?: string; error?: string }> {
  const supabase = createServerClient();

  const [apiRes, promptsRes, historyRes] = await Promise.all([
    supabase.from('api_settings').select('*').eq('id', 1).single<APISettings>(),
    supabase.from('prompts').select('*').eq('id', 1).single<Prompts>(),
    supabase
      .from('ai_messages')
      .select('role, content')
      .eq('student_id', studentId)
      .eq('phase', phase)
      .order('created_at', { ascending: true }),
  ]);

  if (!apiRes.data || !promptsRes.data) return { error: 'API 설정이 없습니다.' };

  const history = (historyRes.data ?? []) as { role: 'user' | 'assistant'; content: string }[];
  const messages = [...history, { role: 'user' as const, content: userContent }];

  try {
    const reply = await callAI(messages, passageContent, summary, promptsRes.data, apiRes.data);

    await supabase.from('ai_messages').insert([
      { student_id: studentId, phase, role: 'user', content: userContent },
      { student_id: studentId, phase, role: 'assistant', content: reply },
    ]);

    return { reply };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'AI 호출 실패' };
  }
}
