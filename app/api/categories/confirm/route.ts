import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, resolveAdminId } from '@/lib/auth';
import { saveCategories, TreeNode } from '@/lib/categorizer';

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = resolveAdminId(user);
  const { tree } = await req.json() as { tree: TreeNode[] };

  if (!Array.isArray(tree)) {
    return NextResponse.json({ error: 'tree 배열이 필요합니다.' }, { status: 400 });
  }

  await saveCategories(adminId, tree);
  return NextResponse.json({ ok: true });
}
