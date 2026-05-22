import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, resolveAdminId } from '@/lib/auth';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';
import { encodeStoragePath } from '@/lib/storage-key';

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = resolveAdminId(user);
  const { from, to } = await req.json();
  if (!from || !to) {
    return NextResponse.json({ error: 'from과 to 경로가 필요합니다.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .move(`${adminId}/${encodeStoragePath(from)}`, `${adminId}/${encodeStoragePath(to)}`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
