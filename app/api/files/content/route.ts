import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, resolveAdminId } from '@/lib/auth';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';
import { encodeStoragePath } from '@/lib/storage-key';

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = resolveAdminId(user);
  const path = req.nextUrl.searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path 파라미터가 필요합니다.' }, { status: 400 });

  const fullPath = `${adminId}/${encodeStoragePath(path)}`;
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .download(fullPath);

  if (error || !data) {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
  }

  const content = await data.text();
  return NextResponse.json({ content });
}

export async function PUT(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = resolveAdminId(user);
  const { path, content } = await req.json();
  if (!path) return NextResponse.json({ error: 'path가 필요합니다.' }, { status: 400 });

  const fullPath = `${adminId}/${encodeStoragePath(path)}`;
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(fullPath, content ?? '', {
      contentType: 'text/plain; charset=utf-8',
      upsert: true,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
