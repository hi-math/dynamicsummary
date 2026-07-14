import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

// navigator.sendBeacon target for flushing a student note on tab close/refresh, where
// an async Server Action would not reliably complete. Mirrors saveStudentNote: the note
// is stored on the cycle's draft-phase row (cycle-scoped).
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { studentId?: string; cycleKey?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const { studentId, cycleKey, content } = body;
  if (!studentId || !cycleKey) {
    return NextResponse.json({ error: 'studentId and cycleKey required' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase.from('session_data').upsert(
    { student_id: studentId, phase: `${cycleKey}_draft`, notes: content ?? '', updated_at: new Date().toISOString() },
    { onConflict: 'student_id,phase' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
