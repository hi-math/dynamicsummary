import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

// Read-only polling endpoint for human-team chat. Served as a GET Route Handler
// (not a Server Action) so the frequent 1.x-second poll does NOT enter the Server
// Action queue — otherwise it serializes with sendHumanMessage/presence polls and
// adds noticeable send→receive latency.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId');
  const cycleKey = searchParams.get('cycleKey');
  if (!studentId || !cycleKey) {
    return NextResponse.json({ error: 'studentId and cycleKey required' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('human_messages')
    .select('*')
    .eq('student_id', studentId)
    .eq('cycle_key', cycleKey)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'no-store' } });
}
