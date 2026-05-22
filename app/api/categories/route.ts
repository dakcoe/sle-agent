import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, resolveAdminId } from '@/lib/auth';
import { getCategories } from '@/lib/categorizer';

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const adminId = resolveAdminId(user);
  const tree = await getCategories(adminId);

  return NextResponse.json({ tree });
}
