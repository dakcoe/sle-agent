import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, resolveAdminId } from '@/lib/auth';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';
import { encodeStoragePath } from '@/lib/storage-key';

export async function DELETE(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = resolveAdminId(user);
  const path = req.nextUrl.searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path가 필요합니다.' }, { status: 400 });

  const encodedPath = encodeStoragePath(path);
  const fullPath = `${adminId}/${encodedPath}`;

  // Try as file first
  const { error: fileError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .remove([fullPath]);

  if (!fileError) return NextResponse.json({ ok: true });

  // Try as folder: list all items recursively and delete
  const toDelete = await listAllFiles(fullPath);
  if (toDelete.length > 0) {
    const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).remove(toDelete);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function listAllFiles(prefix: string): Promise<string[]> {
  const { data } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .list(prefix, { limit: 500 });

  if (!data) return [];

  const paths: string[] = [];
  for (const item of data) {
    const fullItemPath = `${prefix}/${item.name}`;
    if (item.id === null) {
      paths.push(...(await listAllFiles(fullItemPath)));
    } else {
      paths.push(fullItemPath);
    }
  }
  return paths;
}
