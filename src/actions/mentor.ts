'use server';

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

export async function getHumanMessages(studentId: string): Promise<HumanMessage[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('human_messages')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: true });
  return (data ?? []) as HumanMessage[];
}

export async function sendHumanMessage(
  studentId: string,
  senderId: string,
  content: string,
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.from('human_messages').insert({
    student_id: studentId,
    sender_id: senderId,
    content,
  });
  if (error) return { error: error.message };
  return {};
}
