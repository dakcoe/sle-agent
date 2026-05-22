import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword, signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { username, password, role, adminCode } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: '아이디와 비밀번호를 입력하세요.' }, { status: 400 });
  }
  if (!['admin', 'user'].includes(role)) {
    return NextResponse.json({ error: '올바르지 않은 역할입니다.' }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  let linkedAdminId: number | null = null;

  if (role === 'user' && adminCode) {
    // adminCode is the admin's username
    const { data: adminUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('username', adminCode)
      .eq('role', 'admin')
      .single();

    if (!adminUser) {
      return NextResponse.json({ error: '유효하지 않은 관리자 코드입니다.' }, { status: 400 });
    }
    linkedAdminId = adminUser.id;
  }

  const { data: newUser, error } = await supabaseAdmin
    .from('users')
    .insert({
      username,
      password_hash: passwordHash,
      role,
      admin_id: linkedAdminId,
    })
    .select('id, username, role, admin_id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 사용 중인 아이디입니다.' }, { status: 409 });
    }
    return NextResponse.json({ error: '회원가입에 실패했습니다.' }, { status: 500 });
  }

  const token = signToken({
    userId: newUser.id,
    username: newUser.username,
    role: newUser.role,
    adminId: newUser.admin_id,
  });

  return NextResponse.json({ token, username: newUser.username, role: newUser.role });
}
