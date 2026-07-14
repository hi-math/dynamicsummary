'use server';

// -- Run in Supabase SQL Editor:
// -- create table if not exists presence (user_id text primary key, last_seen timestamptz not null default now());
// -- alter table presence add column if not exists typing_at timestamptz;
// -- alter table presence enable row level security;
// -- create policy "presence_all" on presence for all using (true) with check (true);
// --
// -- ALTER TABLE human_messages ADD COLUMN IF NOT EXISTS cycle_key text NOT NULL DEFAULT 'cycle1';
// -- CREATE INDEX IF NOT EXISTS human_messages_cycle_idx ON human_messages (student_id, cycle_key);
// --
// -- create table if not exists mentor_notes (
// --   mentor_id text not null,
// --   student_id text not null,
// --   cycle_key text not null,
// --   content text not null default '',
// --   updated_at timestamptz not null default now(),
// --   primary key (mentor_id, student_id, cycle_key)
// -- );
// -- alter table mentor_notes enable row level security;
// -- create policy "mentor_notes_all" on mentor_notes for all using (true) with check (true);
// --
// -- ALTER TABLE session_data ADD COLUMN IF NOT EXISTS learning_completed boolean NOT NULL DEFAULT false;

import { createServerClient } from '@/lib/supabase-server';
import type { HumanMessage, User } from '@/types';

export async function getMentorStudents(mentorId: string): Promise<User[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'student')
    .eq('team', 'human')
    .eq('mentor_id', mentorId)
    .order('name');
  return (data ?? []) as User[];
}

export async function getHumanMessages(studentId: string, cycleKey: string): Promise<HumanMessage[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('human_messages')
    .select('*')
    .eq('student_id', studentId)
    .eq('cycle_key', cycleKey)
    .order('created_at', { ascending: true });
  return (data ?? []) as HumanMessage[];
}

export async function sendHumanMessage(
  studentId: string,
  senderId: string,
  content: string,
  cycleKey: string,
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.from('human_messages').insert({
    student_id: studentId,
    sender_id: senderId,
    content,
    cycle_key: cycleKey,
  });
  if (error) return { error: error.message };
  return {};
}

export async function updatePresence(userId: string): Promise<void> {
  const supabase = createServerClient();
  await supabase.from('presence').upsert(
    { user_id: userId, last_seen: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
}

export async function getPresence(userId: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data } = await supabase.from('presence').select('last_seen').eq('user_id', userId).single();
  return data?.last_seen ?? null;
}

// Typing indicator — reuses the presence row. `typing_at` is refreshed while the user
// is typing and cleared (null) when they stop. Readers treat it as "typing" only if recent.
// Migration for existing DB: alter table presence add column if not exists typing_at timestamptz;
export async function setTyping(userId: string, typing: boolean): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from('presence').upsert(
    { user_id: userId, typing_at: typing ? new Date().toISOString() : null },
    { onConflict: 'user_id' },
  );
  if (error) console.error('[setTyping] failed — is the presence.typing_at column present?', error.message);
}

export async function getTyping(userId: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from('presence').select('typing_at').eq('user_id', userId).maybeSingle();
  if (error) { console.error('[getTyping] failed — is the presence.typing_at column present?', error.message); return null; }
  return data?.typing_at ?? null;
}

export async function getPresenceBatch(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const supabase = createServerClient();
  const { data } = await supabase.from('presence').select('user_id, last_seen').in('user_id', userIds);
  return Object.fromEntries((data ?? []).map((r: { user_id: string; last_seen: string }) => [r.user_id, r.last_seen]));
}

export async function getMentorById(mentorId: string): Promise<{ id: string; name: string } | null> {
  const supabase = createServerClient();
  const { data } = await supabase.from('users').select('id, name').eq('id', mentorId).single();
  return data;
}

export async function getStudentSummary(studentId: string, phase: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('session_data')
    .select('summary')
    .eq('student_id', studentId)
    .eq('phase', phase)
    .single();
  return data?.summary ?? null;
}

export async function getCyclePassage(cycleKey: string): Promise<{ title: string; content: string } | null> {
  const supabase = createServerClient();
  const { data } = await supabase.from('passages').select('title, content').eq('cycle_key', cycleKey).single();
  return data;
}

// ─── Learning completion (mentor approves student's progression) ───────────────

export async function getLearningComplete(studentId: string, phase: string): Promise<boolean> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('session_data')
    .select('learning_completed')
    .eq('student_id', studentId)
    .eq('phase', phase)
    .single();
  return !!data?.learning_completed;
}

export async function setLearningComplete(
  studentId: string,
  phase: string,
  completed: boolean,
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.from('session_data').upsert(
    { student_id: studentId, phase, learning_completed: completed, updated_at: new Date().toISOString() },
    { onConflict: 'student_id,phase' },
  );
  if (error) return { error: error.message };
  return {};
}

export async function getMentorNote(
  mentorId: string,
  studentId: string,
  cycleKey: string,
): Promise<string> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('mentor_notes')
    .select('content')
    .eq('mentor_id', mentorId)
    .eq('student_id', studentId)
    .eq('cycle_key', cycleKey)
    .single();
  return data?.content ?? '';
}

export async function saveMentorNote(
  mentorId: string,
  studentId: string,
  cycleKey: string,
  content: string,
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.from('mentor_notes').upsert(
    { mentor_id: mentorId, student_id: studentId, cycle_key: cycleKey, content, updated_at: new Date().toISOString() },
    { onConflict: 'mentor_id,student_id,cycle_key' }
  );
  if (error) return { error: error.message };
  return {};
}
