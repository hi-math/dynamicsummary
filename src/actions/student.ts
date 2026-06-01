'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { callAI } from '@/lib/ai';
import { nextPhase } from '@/lib/phases';
import { initDASession, processTurn, advanceToNextItem, createInitialState } from '@/lib/da-pipeline';
import type { APISettings, Prompts, SessionData, AIMessage, Phase, DASessionState, ComprehensionQuestion, TurnResult } from '@/types';

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

// ─── Comprehension ────────────────────────────────────────────────────────────

export async function getComprehensionQuestions(cycleKey: string): Promise<ComprehensionQuestion[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('comprehension_questions')
    .select('questions')
    .eq('cycle_key', cycleKey)
    .single();
  return (data?.questions ?? []) as ComprehensionQuestion[];
}

export async function submitComprehensionAnswers(
  studentId: string,
  phase: string,
  answers: Record<string, string>,
  elapsedSeconds: number,
) {
  const supabase = createServerClient();
  const { error } = await supabase.from('comprehension_answers').upsert({
    student_id: studentId,
    phase,
    answers,
    elapsed_seconds: elapsedSeconds,
    submitted_at: new Date().toISOString(),
  }, { onConflict: 'student_id,phase' });
  if (error) return { error: error.message };
  return { success: true };
}

// ─── DA session state ─────────────────────────────────────────────────────────

async function loadPromptAssets(supabase: ReturnType<typeof createServerClient>): Promise<Record<string, string>> {
  const { data } = await supabase.from('prompt_assets').select('key, content');
  return Object.fromEntries((data ?? []).map((r: { key: string; content: string }) => [r.key, r.content]));
}

export async function getDASessionState(studentId: string, phase: string): Promise<DASessionState | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('da_session_state')
    .select('*')
    .eq('student_id', studentId)
    .eq('phase', phase)
    .single();
  if (!data) return null;
  return {
    priority_queue: data.priority_queue,
    current_item_idx: data.current_item_idx,
    current_step: data.current_step,
    item_identification_cumulative: data.item_identification_cumulative,
    item_verbalization_cumulative: data.item_verbalization_cumulative,
    resolutions: data.resolutions,
    session_complete: data.session_complete,
    diagnosis_confidence: data.diagnosis_confidence,
    assessor_output: data.assessor_output,
  } as DASessionState;
}

async function saveDASessionState(
  supabase: ReturnType<typeof createServerClient>,
  studentId: string,
  phase: string,
  state: DASessionState,
  extra?: { assessorOutputsAll?: unknown; verifierNotesAll?: unknown },
) {
  await supabase.from('da_session_state').upsert({
    student_id: studentId,
    phase,
    priority_queue: state.priority_queue,
    current_item_idx: state.current_item_idx,
    current_step: state.current_step,
    item_identification_cumulative: state.item_identification_cumulative,
    item_verbalization_cumulative: state.item_verbalization_cumulative,
    resolutions: state.resolutions,
    session_complete: state.session_complete,
    diagnosis_confidence: state.diagnosis_confidence,
    assessor_output: state.assessor_output,
    ...(extra?.assessorOutputsAll ? { assessor_outputs_all: extra.assessorOutputsAll } : {}),
    ...(extra?.verifierNotesAll ? { verifier_notes_all: extra.verifierNotesAll } : {}),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'student_id,phase' });
}

// Starts the DA session: runs Assessor → Verifier → Priority selection
export async function startDASession(
  studentId: string,
  phase: string,
  summary: string,
  passageContent: string,
): Promise<{ state: DASessionState; error?: string }> {
  const supabase = createServerClient();

  const [apiRes, prompts] = await Promise.all([
    supabase.from('api_settings').select('*').eq('id', 1).single<APISettings>(),
    loadPromptAssets(supabase),
  ]);
  if (!apiRes.data) return { state: createInitialState(), error: 'API 설정이 없습니다.' };

  try {
    const { state, assessorOutputsAll, verifierNotesAll } = await initDASession(
      summary, passageContent, prompts, apiRes.data
    );
    await saveDASessionState(supabase, studentId, phase, state, { assessorOutputsAll, verifierNotesAll });
    return { state };
  } catch (e) {
    return { state: createInitialState(), error: e instanceof Error ? e.message : 'DA 초기화 실패' };
  }
}

// Processes one student turn through Classifier → route → Mediator
export async function sendDAMessage(
  studentId: string,
  phase: string,
  studentMessage: string,
  summary: string,
  passageContent: string,
): Promise<TurnResult & { error?: string }> {
  const supabase = createServerClient();

  const [apiRes, prompts, currentState] = await Promise.all([
    supabase.from('api_settings').select('*').eq('id', 1).single<APISettings>(),
    loadPromptAssets(supabase),
    getDASessionState(studentId, phase),
  ]);

  if (!apiRes.data) return { utterance: '', updated_state: createInitialState(), resolution_achieved: false, tab_unlocked: false, session_complete: false, classification: 'on_track', error: 'API 설정이 없습니다.' };
  if (!currentState) return { utterance: '', updated_state: createInitialState(), resolution_achieved: false, tab_unlocked: false, session_complete: false, classification: 'on_track', error: 'DA 세션이 초기화되지 않았습니다.' };

  try {
    const result = await processTurn(currentState, studentMessage, summary, passageContent, prompts, apiRes.data);

    // Save updated state
    await saveDASessionState(supabase, studentId, phase, result.updated_state);

    // Save messages
    await supabase.from('ai_messages').insert([
      { student_id: studentId, phase, role: 'user', content: studentMessage },
      { student_id: studentId, phase, role: 'assistant', content: result.utterance },
    ]);

    return result;
  } catch (e) {
    return { utterance: '', updated_state: currentState, resolution_achieved: false, tab_unlocked: false, session_complete: false, classification: 'on_track', error: e instanceof Error ? e.message : '처리 실패' };
  }
}

// Called when chatbot student clicks next tab after resolution
export async function advanceDATab(studentId: string, phase: string): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const state = await getDASessionState(studentId, phase);
  if (!state) return { error: '세션을 찾을 수 없습니다.' };
  const next = advanceToNextItem(state);
  await saveDASessionState(supabase, studentId, phase, next);
  return {};
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
