import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId, block } = await req.json() as { userId: number; block: boolean };

  // Verify the target user belongs to this admin
  const { data: target } = await supabaseAdmin
    .from('users')
    .select('id, admin_id')
    .eq('id', userId)
    .single();

  if (!target || target.admin_id !== user.userId) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({ is_blocked: block })
    .eq('id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
