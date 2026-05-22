import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, resolveAdminId } from '@/lib/auth';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';
import { decodeStoragePath } from '@/lib/storage-key';

interface TreeNode {
  name: string;
  path: string; // decoded human-readable path (e.g. "여비규정/총칙/목적.txt")
  type: 'folder' | 'file';
  children?: TreeNode[];
}

// storagePrefix: hex-encoded Supabase path (for list operations)
// displayPrefix: decoded human-readable path (returned to client)
async function buildTree(storagePrefix: string, displayPrefix: string): Promise<TreeNode[]> {
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .list(storagePrefix, { limit: 500 });

  if (error || !data) return [];

  const nodes: TreeNode[] = [];
  for (const item of data) {
    if (item.name === 'categories.json' || item.name === '.gitkeep') continue;

    const decodedName = decodeStoragePath(item.name);
    const displayPath = displayPrefix ? `${displayPrefix}/${decodedName}` : decodedName;
    const childStoragePath = `${storagePrefix}/${item.name}`;

    if (item.id === null) {
      const children = await buildTree(childStoragePath, displayPath);
      nodes.push({ name: decodedName, path: displayPath, type: 'folder', children });
    } else if (decodedName.endsWith('.txt')) {
      nodes.push({
        name: decodedName.slice(0, -4),
        path: displayPath, // decoded, e.g. "여비규정/총칙/목적.txt"
        type: 'file',
      });
    }
  }
  return nodes;
}

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = resolveAdminId(user);
  const tree = await buildTree(String(adminId), '');

  return NextResponse.json({ tree });
}
