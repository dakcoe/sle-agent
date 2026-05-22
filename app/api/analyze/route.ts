import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, resolveAdminId } from '@/lib/auth';
import { supabaseAdmin, UPLOADS_BUCKET } from '@/lib/supabase';
import { parseBuffer } from '@/lib/file-parser';
import { proposeCategories } from '@/lib/categorizer';
import { toStorageFilename } from '@/lib/storage-key';

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = resolveAdminId(user);
  const { filename } = await req.json();
  if (!filename) {
    return NextResponse.json({ error: 'filename이 필요합니다.' }, { status: 400 });
  }

  const storagePath = `${adminId}/${toStorageFilename(filename)}`;
  const { data, error } = await supabaseAdmin.storage
    .from(UPLOADS_BUCKET)
    .download(storagePath);

  if (error || !data) {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const content = await parseBuffer(buffer, filename);
  const tree = await proposeCategories(filename, content);

  return NextResponse.json({ tree });
}
