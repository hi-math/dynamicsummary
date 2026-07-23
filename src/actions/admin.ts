'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import type { APISettings, Prompts, User } from '@/types';
import type { Phase } from '@/lib/phases';
import { nextPhase, PHASES, isValidPhase } from '@/lib/phases';

// ─── Users ───────────────────────────────────────────────────────────────────

export async function getUsers(): Promise<User[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const users = (data ?? []) as User[];
  // Manual display order first (sort_order), then creation order as a fallback for
  // rows that have never been dragged. Tolerant of the column being absent.
  users.sort((a, b) => {
    const ao = a.sort_order, bo = b.sort_order;
    if (ao != null && bo != null && ao !== bo) return ao - bo;
    if (ao != null && bo == null) return -1;
    if (ao == null && bo != null) return 1;
    return (a.created_at ?? '').localeCompare(b.created_at ?? '');
  });
  return users;
}

// Persist a new manual ordering of accounts (drag-to-reorder in the admin list).
export async function reorderUsers(orderedIds: string[]) {
  const supabase = createServerClient();
  const results = await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from('users').update({ sort_order: idx }).eq('id', id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  revalidatePath('/admin');
  return { success: true };
}

export async function createUser(formData: FormData) {
  const id = (formData.get('id') as string).trim();
  const name = (formData.get('name') as string).trim();
  const role = formData.get('role') as string;
  const team = formData.get('team') as string | null;

  if (!id || !name || !role) return { error: '모든 필드를 입력해주세요.' };

  const supabase = createServerClient();
  const { error } = await supabase.from('users').insert({
    id,
    name,
    role,
    team: team || null,
    current_phase: 'cycle1_draft',
  });

  if (error) {
    if (error.code === '23505') return { error: '이미 존재하는 아이디입니다.' };
    return { error: error.message };
  }

  revalidatePath('/admin');
  return { success: true };
}

export async function updateUser(formData: FormData) {
  const id = formData.get('id') as string;
  const name = (formData.get('name') as string).trim();
  const role = formData.get('role') as string;
  const team = formData.get('team') as string | null;

  if (id === 'admin') return { error: '관리자 계정은 수정할 수 없습니다.' };

  const supabase = createServerClient();
  const { error } = await supabase
    .from('users')
    .update({ name, role, team: team || null })
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { success: true };
}

export async function deleteUser(id: string) {
  if (id === 'admin') return { error: '관리자 계정은 삭제할 수 없습니다.' };

  const supabase = createServerClient();
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/admin');
  return { success: true };
}

export async function advancePhase(studentId: string) {
  const supabase = createServerClient();
  const { data: user, error: fetchError } = await supabase
    .from('users')
    .select('current_phase')
    .eq('id', studentId)
    .single();

  if (fetchError || !user) return { error: '사용자를 찾을 수 없습니다.' };

  const currentPhase = user.current_phase as Phase;
  const next = nextPhase(currentPhase);
  if (next === currentPhase) return { error: '이미 마지막 단계입니다.' };

  const { error } = await supabase
    .from('users')
    .update({ current_phase: next })
    .eq('id', studentId);

  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { success: true, nextPhase: next };
}

export async function setPhase(studentId: string, phase: string) {
  if (!isValidPhase(phase)) return { error: '잘못된 단계입니다.' };

  const supabase = createServerClient();
  const { error } = await supabase
    .from('users')
    .update({ current_phase: phase })
    .eq('id', studentId);

  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { success: true };
}

export async function getMentors(): Promise<User[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'mentor')
    .order('name');
  return (data ?? []) as User[];
}

export async function assignMentor(studentId: string, mentorId: string | null) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('users')
    .update({ mentor_id: mentorId })
    .eq('id', studentId);
  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { success: true };
}

// ─── API Settings ─────────────────────────────────────────────────────────────

export async function getAPISettings(): Promise<APISettings | null> {
  const supabase = createServerClient();
  const { data } = await supabase.from('api_settings').select('*').eq('id', 1).single();
  return data as APISettings | null;
}

export async function saveAPISettings(formData: FormData) {
  const supabase = createServerClient();
  const { error } = await supabase.from('api_settings').upsert({
    id: 1,
    provider: formData.get('provider'),
    openai_key: formData.get('openai_key') ?? '',
    openai_model: formData.get('openai_model') ?? 'gpt-5.5',
    anthropic_key: formData.get('anthropic_key') ?? '',
    anthropic_model: formData.get('anthropic_model') ?? 'claude-opus-4-8',
    gemini_key: formData.get('gemini_key') ?? '',
    gemini_model: formData.get('gemini_model') ?? 'gemini-2.5-flash',
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { success: true };
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

export async function getPrompts(): Promise<Prompts | null> {
  const supabase = createServerClient();
  const { data } = await supabase.from('prompts').select('*').eq('id', 1).single();
  return data as Prompts | null;
}

export async function savePrompts(formData: FormData) {
  const supabase = createServerClient();
  const { error } = await supabase.from('prompts').upsert({
    id: 1,
    system_prompt: formData.get('system_prompt') ?? '',
    da_prompt: formData.get('da_prompt') ?? '',
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { success: true };
}

// ─── Passages ─────────────────────────────────────────────────────────────────

export async function getPassages() {
  const supabase = createServerClient();
  const { data } = await supabase.from('passages').select('*');
  return data ?? [];
}

export async function savePassage(formData: FormData) {
  const supabase = createServerClient();
  const { error } = await supabase.from('passages').upsert({
    cycle_key: formData.get('cycle_key'),
    title: formData.get('title') ?? '',
    content: formData.get('content') ?? '',
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { success: true };
}

// ─── Prompt Assets ────────────────────────────────────────────────────────────

export async function getPromptAssets(): Promise<Record<string, string>> {
  const supabase = createServerClient();
  const { data } = await supabase.from('prompt_assets').select('key, content');
  return Object.fromEntries((data ?? []).map((r: { key: string; content: string }) => [r.key, r.content]));
}

export async function savePromptAsset(key: string, content: string) {
  const supabase = createServerClient();
  const { error } = await supabase.from('prompt_assets').upsert(
    { key, content, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { success: true };
}

// ─── Comprehension Questions ──────────────────────────────────────────────────

export async function saveComprehensionQuestions(cycleKey: string, questions: unknown[]) {
  const supabase = createServerClient();
  const { error } = await supabase.from('comprehension_questions').upsert(
    { cycle_key: cycleKey, questions, updated_at: new Date().toISOString() },
    { onConflict: 'cycle_key' },
  );
  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { success: true };
}

export async function getComprehensionQuestionsAdmin() {
  const supabase = createServerClient();
  const { data } = await supabase.from('comprehension_questions').select('*');
  return data ?? [];
}

// ─── Data / Export ────────────────────────────────────────────────────────────

export async function getStudentData(studentId: string) {
  const supabase = createServerClient();
  const [sessionsRes, aiMsgsRes, humanMsgsRes, daStatesRes] = await Promise.all([
    supabase.from('session_data').select('*').eq('student_id', studentId),
    supabase.from('ai_messages').select('*').eq('student_id', studentId).order('created_at'),
    supabase.from('human_messages').select('*').eq('student_id', studentId).order('created_at'),
    // Assessor 진단·지도 계획 (CSV 내보내기의 [진단 및 지도 계획] 섹션에 쓰인다)
    supabase.from('da_session_state').select('phase, assessor_output').eq('student_id', studentId),
  ]);
  return {
    sessions: sessionsRes.data ?? [],
    aiMessages: aiMsgsRes.data ?? [],
    humanMessages: humanMsgsRes.data ?? [],
    daStates: daStatesRes.data ?? [],
  };
}

// Soft-delete: toggle whether a student's collected data shows in the data view or the
// trash. Nothing is removed from the database.
export async function setDataTrashed(studentId: string, trashed: boolean): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.from('users').update({ data_trashed: trashed }).eq('id', studentId);
  if (error) return { error: error.message };
  revalidatePath('/admin');
  return {};
}

export async function getAllStudentsData() {
  const supabase = createServerClient();
  const { data: students } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'student')
    .order('created_at');

  if (!students || students.length === 0) return [];

  const results = await Promise.all(
    students.map(async (s) => {
      const d = await getStudentData(s.id);
      return { student: s, ...d };
    }),
  );
  return results;
}
