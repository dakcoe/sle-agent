import { NextRequest } from 'next/server';
import { getAuthUser, getTokenFromQuery, resolveAdminId } from '@/lib/auth';
import { supabaseAdmin, UPLOADS_BUCKET } from '@/lib/supabase';
import { getChunks } from '@/lib/file-parser';
import { getCategories, processDocument } from '@/lib/categorizer';
import { toStorageFilename } from '@/lib/storage-key';

export async function GET(req: NextRequest) {
  const user = getTokenFromQuery(req) || getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return new Response('Unauthorized', { status: 401 });
  }

  const filename = req.nextUrl.searchParams.get('filename');
  if (!filename) {
    return new Response('filename required', { status: 400 });
  }

  const adminId = resolveAdminId(user);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Client disconnected — continue processing anyway so files are written
        }
      }

      try {
        send({ type: 'progress', message: '파일 로딩 중...' });

        const storagePath = `${adminId}/${toStorageFilename(filename)}`;
        const { data: fileData, error } = await supabaseAdmin.storage
          .from(UPLOADS_BUCKET)
          .download(storagePath);

        if (error || !fileData) {
          send({ type: 'error', message: '파일을 찾을 수 없습니다.' });
          controller.close();
          return;
        }

        const buffer = Buffer.from(await fileData.arrayBuffer());
        send({ type: 'progress', message: '문서 분석 중...' });

        const chunks = await getChunks(buffer, filename);
        send({ type: 'progress', message: `총 ${chunks.length}개 청크 발견` });

        const tree = await getCategories(adminId);
        if (!tree.length) {
          send({ type: 'error', message: '카테고리 트리가 없습니다. 먼저 분류를 확정해주세요.' });
          controller.close();
          return;
        }

        await processDocument(adminId, filename, chunks, tree, (msg) => {
          send({ type: 'progress', message: msg });
        });

        send({ type: 'done', message: '처리 완료' });
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
