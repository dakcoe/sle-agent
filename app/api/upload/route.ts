import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, resolveAdminId } from '@/lib/auth';
import { supabaseAdmin, UPLOADS_BUCKET } from '@/lib/supabase';
import { toStorageFilename } from '@/lib/storage-key';

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = resolveAdminId(user);
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
  }

  const allowed = ['pdf', 'docx', 'txt'];
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !allowed.includes(ext)) {
    return NextResponse.json({ error: 'PDF, DOCX, TXT 파일만 업로드 가능합니다.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${adminId}/${toStorageFilename(file.name)}`;

  const { error } = await supabaseAdmin.storage
    .from(UPLOADS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });

  if (error) {
    console.error('[upload] Supabase error:', error);
    return NextResponse.json({ error: '업로드에 실패했습니다: ' + error.message }, { status: 500 });
  }

  return NextResponse.json({ filename: file.name, path: storagePath });
}
