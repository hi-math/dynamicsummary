import { cookies } from 'next/headers';
import type { SessionCookie } from '@/types';

const COOKIE_NAME = 'ds_session';

export async function getSession(): Promise<SessionCookie | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as SessionCookie;
  } catch {
    return null;
  }
}

export async function setSession(data: SessionCookie): Promise<void> {
  const store = await cookies();
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64');
  store.set(COOKIE_NAME, encoded, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
