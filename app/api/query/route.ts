import { NextRequest } from 'next/server';
import { getAuthUser, resolveAdminId } from '@/lib/auth';
import { runQuery, ConversationMessage } from '@/lib/query-engine';

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { question, conversation_history } = await req.json() as {
    question: string;
    conversation_history?: ConversationMessage[];
  };

  if (!question?.trim()) return new Response('질문을 입력하세요.', { status: 400 });

  const adminId = resolveAdminId(user);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* client disconnected */ }
      }

      try {
        const result = await runQuery(
          question,
          conversation_history || [],
          adminId,
          (msg) => send({ type: 'progress', message: msg }),
        );
        send({
          type: 'done',
          answer: result.answer,
          source: result.source,
          relevant_sections: result.relevantSections,
          path_taken: result.pathTaken,
          found: result.found,
        });
      } catch (err) {
        send({ type: 'error', message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
