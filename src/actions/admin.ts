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
  return (data ?? []) as User[];
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
    anthropic_model: formData.get('anthropic_model') ?? 'claude-opus-4-7',
    gemini_key: formData.get('gemini_key') ?? '',
    gemini_model: formData.get('gemini_model') ?? 'gemini-2.5-flash',
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
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
  const [sessionsRes, aiMsgsRes, humanMsgsRes] = await Promise.all([
    supabase.from('session_data').select('*').eq('student_id', studentId),
    supabase.from('ai_messages').select('*').eq('student_id', studentId).order('created_at'),
    supabase.from('human_messages').select('*').eq('student_id', studentId).order('created_at'),
  ]);
  return {
    sessions: sessionsRes.data ?? [],
    aiMessages: aiMsgsRes.data ?? [],
    humanMessages: humanMsgsRes.data ?? [],
  };
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
