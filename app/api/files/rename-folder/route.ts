import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, resolveAdminId } from '@/lib/auth';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';
import { encodeStoragePath } from '@/lib/storage-key';

async function listAllFiles(prefix: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .list(prefix, { limit: 1000 });

  if (error || !data) return [];

  const files: string[] = [];
  for (const item of data) {
    const fullPath = `${prefix}/${item.name}`;
    if (item.id === null) {
      // folder — recurse
      const children = await listAllFiles(fullPath);
      files.push(...children);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

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

  const encodedFrom = encodeStoragePath(from);
  const encodedTo = encodeStoragePath(to);
  const storageFrom = `${adminId}/${encodedFrom}`;
  const storageTo = `${adminId}/${encodedTo}`;

  const allFiles = await listAllFiles(storageFrom);
  if (allFiles.length === 0) {
    return NextResponse.json({ error: '폴더가 비어있거나 존재하지 않습니다.' }, { status: 404 });
  }

  const errors: string[] = [];
  for (const filePath of allFiles) {
    const relativePath = filePath.slice(storageFrom.length + 1); // strip prefix + slash
    const newPath = `${storageTo}/${relativePath}`;
    const { error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .move(filePath, newPath);
    if (error) errors.push(`${filePath}: ${error.message}`);
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('\n') }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
