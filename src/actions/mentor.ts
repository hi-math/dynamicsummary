'use server';

// -- Run in Supabase SQL Editor:
// -- create table if not exists presence (user_id text primary key, last_seen timestamptz not null default now());
// -- alter table presence enable row level security;
// -- create policy "presence_all" on presence for all using (true) with check (true);
// --
// -- ALTER TABLE human_messages ADD COLUMN IF NOT EXISTS cycle_key text NOT NULL DEFAULT 'cycle1';
// -- CREATE INDEX IF NOT EXISTS human_messages_cycle_idx ON human_messages (student_id, cycle_key);

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
