import { callGeminiJson } from './gemini';
import { supabaseAdmin, STORAGE_BUCKET } from './supabase';
import { encodeStoragePath } from './storage-key';

export interface TreeNode {
  name: string;
  children?: TreeNode[];
}

const FILE_EXT_RE = /\.(txt|md|pdf|docx|doc|xlsx|csv|hwp)$/i;

export function safeName(name: string): string {
  return name.replace(FILE_EXT_RE, '').replace(/[/\\:*?"<>|]/g, '_').trim();
}

export function getLeafPaths(tree: TreeNode[], prefix = ''): string[] {
  const paths: string[] = [];
  for (const node of tree) {
    const name = safeName(node.name);
    const path = prefix ? `${prefix}/${name}` : name;
    if (node.children && node.children.length > 0) {
      paths.push(...getLeafPaths(node.children, path));
    } else {
      paths.push(`${path}.txt`);
    }
  }
  return paths;
}

export async function proposeCategories(
  filename: string,
  content: string
): Promise<TreeNode[]> {
  const prompt = `다음 문서의 내용을 분석해서 계층적 카테고리 트리를 제안해줘.

파일명: ${filename}
내용 (일부):
${content.slice(0, 3000)}

규칙:
- 최대 4단계 깊이의 트리 구조
- 각 노드는 name과 선택적 children을 가짐
- 리프 노드(children 없음)는 실제 저장될 파일
- 폴더명과 파일명은 한국어로, 내용을 잘 나타내도록
- 파일명에 .txt, .md, .pdf 같은 확장자를 절대 포함하지 말 것
- 너무 많은 분류는 피하고 내용에 맞게 간결하게

JSON으로만 응답:
{"tree": [{"name": "폴더명", "children": [{"name": "파일명"}]}]}`;

  const result = await callGeminiJson(prompt);
  const raw = (result.tree as TreeNode[]) || [];
  return normalizeTree(raw);
}

export function normalizeTree(nodes: unknown[]): TreeNode[] {
  return nodes.map((n) => {
    const node = n as Record<string, unknown>;
    const children =
      (node.children as unknown[]) || (node.sub_categories as unknown[]) || [];
    const rawName = String(node.name || '');
    const cleanName = rawName.replace(FILE_EXT_RE, '').trim() || rawName;
    return {
      name: cleanName,
      ...(children.length > 0 ? { children: normalizeTree(children) } : {}),
    };
  });
}

export async function processDocument(
  adminId: number,
  _filename: string,
  chunks: string[],
  tree: TreeNode[],
  onProgress?: (msg: string) => void
): Promise<void> {
  const leafPaths = getLeafPaths(tree);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    onProgress?.(`청크 ${i + 1}/${chunks.length} 처리 중...`);
    if (i > 0) await new Promise(r => setTimeout(r, 1000));

    const leafList = leafPaths.map((p, idx) => `${idx + 1}. ${p}`).join('\n');
    const prompt = `다음 문서 내용에서 각 파일 경로에 해당하는 내용을 추출해줘.

문서 (청크 ${i + 1}/${chunks.length}):
${chunk.slice(0, 3000)}

저장 경로 목록:
${leafList}

각 경로에 해당하는 내용만 추출해줘. 해당 없으면 빈 문자열.
JSON으로만 응답:
{"extractions": [{"index": 1, "content": "추출된 내용"}]}`;

    try {
      const result = await callGeminiJson(prompt);
      const extractions = (result.extractions as Array<{ index: number; content: string }>) || [];

      for (const extraction of extractions) {
        const leafPath = leafPaths[extraction.index - 1];
        if (!leafPath) continue;
        const content = extraction.content?.trim();
        if (!content || content.startsWith('에러가 발생했습니다:')) continue;

        const storagePath = `${adminId}/${encodeStoragePath(leafPath)}`;

        // Read existing content and append
        const { data: existing } = await supabaseAdmin.storage
          .from(STORAGE_BUCKET)
          .download(storagePath);

        let existingText = '';
        if (existing) {
          existingText = await existing.text();
        }

        const newContent = existingText
          ? `${existingText}\n\n${content}`
          : content;

        await supabaseAdmin.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, newContent, {
            contentType: 'text/plain; charset=utf-8',
            upsert: true,
          });
      }
    } catch (err) {
      console.error(`Chunk ${i + 1} processing error:`, err);
    }
  }

  onProgress?.('처리 완료');
}

export async function getCategories(adminId: number): Promise<TreeNode[]> {
  const path = `${adminId}/categories.json`;
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .download(path);

  if (error || !data) return [];

  try {
    const text = await data.text();
    const json = JSON.parse(text);
    const raw = json.tree || json.categories || [];
    return normalizeTree(raw);
  } catch {
    return [];
  }
}

export async function saveCategories(
  adminId: number,
  tree: TreeNode[]
): Promise<void> {
  const path = `${adminId}/categories.json`;
  const content = JSON.stringify({ tree }, null, 2);
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(path, content, {
      contentType: 'application/json',
      upsert: true,
    });
  if (error) throw new Error(`Failed to save categories: ${error.message}`);
}
