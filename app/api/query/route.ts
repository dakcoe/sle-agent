import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, resolveAdminId } from '@/lib/auth';
import { runQuery, ConversationMessage } from '@/lib/query-engine';

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { question, conversation_history } = await req.json() as {
    question: string;
    conversation_history?: ConversationMessage[];
  };

  if (!question?.trim()) {
    return NextResponse.json({ error: '질문을 입력하세요.' }, { status: 400 });
  }

  const adminId = resolveAdminId(user);
  const result = await runQuery(question, conversation_history || [], adminId);

  return NextResponse.json({
    answer: result.answer,
    source: result.source,
    relevant_sections: result.relevantSections,
    path_taken: result.pathTaken,
    found: result.found,
  });
}
