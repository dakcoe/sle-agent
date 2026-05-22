import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { comparePassword, signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: '아이디와 비밀번호를 입력하세요.' }, { status: 400 });
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, username, password_hash, role, admin_id, is_blocked')
    .eq('username', username)
    .single();

  if (!user) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  if (user.is_blocked) {
    return NextResponse.json({ error: '차단된 계정입니다. 관리자에게 문의하세요.' }, { status: 403 });
  }

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const token = signToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    adminId: user.admin_id,
  });

  return NextResponse.json({ token, username: user.username, role: user.role });
}
