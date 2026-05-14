'use server';

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase-server';
import { setSession, clearSession } from '@/lib/auth';
import type { User } from '@/types';

export async function login(formData: FormData) {
  const id = (formData.get('id') as string)?.trim();
  if (!id) return { error: '아이디를 입력해주세요.' };

  const supabase = createServerClient();
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single<User>();

  if (error || !user) return { error: '존재하지 않는 아이디입니다.' };

  await setSession({ id: user.id, role: user.role, team: user.team, name: user.name });

  if (user.role === 'admin') redirect('/admin');
  if (user.role === 'mentor') redirect('/mentor');
  redirect('/student');
}

export async function logout() {
  await clearSession();
  redirect('/');
}
