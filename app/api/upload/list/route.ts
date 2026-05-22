import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, resolveAdminId } from '@/lib/auth';
import { supabaseAdmin, UPLOADS_BUCKET } from '@/lib/supabase';
import { fromStorageFilename } from '@/lib/storage-key';

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = resolveAdminId(user);
  const { data, error } = await supabaseAdmin.storage
    .from(UPLOADS_BUCKET)
    .list(String(adminId), { limit: 200 });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const files = (data || [])
    .filter(item => item.id !== null)
    .map(item => fromStorageFilename(item.name))
    .sort();

  return NextResponse.json({ files });
}
