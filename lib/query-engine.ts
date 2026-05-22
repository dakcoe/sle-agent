import { callGemini, callGeminiJson } from './gemini';
import { supabaseAdmin, STORAGE_BUCKET } from './supabase';
import { decodeStoragePath, encodeStoragePath } from './storage-key';

const RELEVANCE_CUTOFF = 2;

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  source?: string;
}

interface StorageItem {
  name: string;
  path: string;
  type: 'folder' | 'file';
  score?: number;
}

interface PathStep {
  name: string;
  type: 'folder' | 'file';
  found: boolean;
}

export interface QueryResult {
  answer: string;
  source: string | null;
  relevantSections: string[];
  pathTaken: PathStep[];
  found: boolean;
}

async function listDir(prefix: string): Promise<StorageItem[]> {
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .list(prefix, { limit: 200 });

  if (error || !data) return [];

  return data
    .filter((item) => item.name !== 'categories.json')
    .map((item) => {
      const isFolder = item.id === null;
      const decodedName = decodeStoragePath(item.name);
      return {
        name: isFolder ? decodedName : decodedName.replace(/\.txt$/, ''),
        path: `${prefix}/${item.name}`, // encoded path for Supabase ops
        type: (isFolder ? 'folder' : 'file') as 'folder' | 'file',
      };
    })
    .filter((item) => item.type === 'folder' || item.name !== '');
}

async function getFolderChildNames(prefix: string): Promise<string[]> {
  const { data } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .list(prefix, { limit: 20 });
  if (!data) return [];
  return data
    .filter((item) => item.name !== 'categories.json' && item.name !== '.gitkeep')
    .map((item) => decodeStoragePath(item.name).replace(/\.txt$/, ''))
    .slice(0, 6);
}

async function rankDirItems(
  question: string,
  history: ConversationMessage[],
  items: StorageItem[]
): Promise<StorageItem[]> {
  if (!items.length) return [];

  const historyText = history
    .slice(-2)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  const parts: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let desc = `${i + 1}. [${item.type === 'folder' ? '폴더' : '파일'}] ${item.name}`;
    if (item.type === 'folder') {
      const children = await getFolderChildNames(item.path);
      if (children.length) desc += ` (하위: ${children.join(', ')})`;
    }
    parts.push(desc);
  }

  const prompt = `사용자 질문: ${question}
최근 대화: ${historyText}

다음 번호별 파일/폴더 중 질문의 답변이 있을 가능성을 점수로 매겨줘.
0: 매우 높음 | 1: 높음 | 2: 보통 | 3: 낮음 | 4: 관련 없음

${parts.join('\n')}

JSON으로만 응답 (번호는 위 목록의 번호):
{"rankings": [{"index": 1, "score": 0}]}`;

  try {
    const result = await callGeminiJson(prompt);
    const rankings = (result.rankings as Array<{ index: number; score: number }>) || [];
    const indexScores: Record<number, number> = {};
    for (const r of rankings) indexScores[r.index] = r.score ?? 4;

    for (let i = 0; i < items.length; i++) {
      items[i].score = indexScores[i + 1] ?? 4;
    }

    return items
      .filter((item) => (item.score ?? 4) <= RELEVANCE_CUTOFF)
      .sort((a, b) => (a.score ?? 4) - (b.score ?? 4));
  } catch (err) {
    console.error('Error ranking items:', err);
    return items;
  }
}

async function checkFound(
  question: string,
  fileName: string,
  content: string
): Promise<{ found: boolean; relevantSections: string[] }> {
  if (!content.trim()) return { found: false, relevantSections: [] };

  const prompt = `사용자 질문: ${question}

다음 규정 내용에서 질문에 대한 답변을 찾을 수 있어?

[${fileName}]
${content.slice(0, 4000)}

JSON으로만 응답:
{
  "found": true 또는 false,
  "relevant_sections": ["관련된 조항 원문을 그대로"]
}`;

  try {
    const result = await callGeminiJson(prompt);
    let found = result.found as boolean | string;
    if (typeof found === 'string') found = found.toLowerCase() === 'true';
    return {
      found: Boolean(found),
      relevantSections: (result.relevant_sections as string[]) || [],
    };
  } catch (err) {
    console.error(`Error checking found in ${fileName}:`, err);
    return { found: false, relevantSections: [] };
  }
}

async function generateAnswer(
  question: string,
  source: string,
  relevantSections: string[],
  history: ConversationMessage[]
): Promise<string> {
  const sectionsText = relevantSections.join('\n');
  const historyText = history
    .slice(-4)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  const prompt = `사용자 질문: ${question}

관련 규정:
출처: ${source}
내용:
${sectionsText}

최근 대화:
${historyText}

다음 조건으로 답변해:
1. 출처(${source})와 해당 조항을 명시해
2. 친근하고 대화체로 자연스럽게 설명해
3. 사용자가 추가 정보를 주면 더 정확히 안내할 수 있다고 마지막에 언급해
4. 100~200자 내외로 간결하게`;

  return callGemini(prompt);
}

function generateFallback(pathTaken: PathStep[]): string {
  const searched = pathTaken
    .map((p) => `- ${p.type === 'folder' ? '📁' : '📄'} ${p.name}`)
    .join('\n');
  return `현재 등록된 규정에서 관련 내용을 찾을 수 없었습니다.\n\n**탐색한 항목:**\n${searched || '- 탐색된 항목 없음'}\n\n해당 내용은 담당 부서에 직접 문의해 주시기 바랍니다.`;
}

async function searchDir(
  question: string,
  history: ConversationMessage[],
  prefix: string,
  pathTaken: PathStep[],
  depth = 0,
  maxDepth = 6
): Promise<Omit<QueryResult, 'pathTaken'> | null> {
  if (depth > maxDepth) return null;

  const items = await listDir(prefix);
  if (!items.length) return null;

  const ranked = await rankDirItems(question, history, items);

  for (const item of ranked) {
    if (item.type === 'folder') {
      pathTaken.push({ name: item.name, type: 'folder', found: false });
      const result = await searchDir(
        question, history, item.path, pathTaken, depth + 1, maxDepth
      );
      if (result) return result;
    } else {
      const { data, error } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .download(item.path);

      if (error || !data) continue;

      const content = await data.text();
      const check = await checkFound(question, item.name, content);
      pathTaken.push({ name: item.name, type: 'file', found: check.found });

      if (check.found) {
        // Decode hex path and strip adminId prefix + .txt extension
        const rawPath = item.path.split('/').slice(1).join('/');
        const source = decodeStoragePath(rawPath).replace(/\.txt$/, '');
        const answer = await generateAnswer(question, source, check.relevantSections, history);
        return {
          answer,
          source,
          relevantSections: check.relevantSections,
          found: true,
        };
      }
    }
  }

  return null;
}

async function needsResearch(
  question: string,
  prevAnswer: string,
  prevSource: string
): Promise<boolean> {
  const prompt = `이전 답변: ${prevAnswer}
이전 출처: ${prevSource}
새로운 사용자 메시지: ${question}

새로운 정보를 바탕으로 기존 규정 내용만으로 답변이 가능해,
아니면 다른 항목 추가 탐색이 필요해?

JSON으로만: {"need_research": true 또는 false}`;

  try {
    const result = await callGeminiJson(prompt);
    let need = result.need_research as boolean | string;
    if (typeof need === 'string') need = need.toLowerCase() === 'true';
    return Boolean(need);
  } catch {
    return true;
  }
}

export async function runQuery(
  question: string,
  history: ConversationMessage[],
  adminId: number
): Promise<QueryResult> {
  const storagePrefix = String(adminId);
  const pathTaken: PathStep[] = [];

  // Follow-up shortcut: try previous source file first
  if (history.length > 0) {
    const last = history[history.length - 1];
    if (last.role === 'assistant' && last.source) {
      const doResearch = await needsResearch(question, last.content, last.source);
      if (!doResearch) {
        const filePath = `${storagePrefix}/${encodeStoragePath(`${last.source}.txt`)}`;
        const { data } = await supabaseAdmin.storage
          .from(STORAGE_BUCKET)
          .download(filePath);

        if (data) {
          const content = await data.text();
          const check = await checkFound(question, last.source.split('/').pop()!, content);
          if (check.found) {
            const answer = await generateAnswer(question, last.source, check.relevantSections, history);
            return {
              answer,
              source: last.source,
              relevantSections: check.relevantSections,
              pathTaken: [],
              found: true,
            };
          }
        }
      }
    }
  }

  const result = await searchDir(question, history, storagePrefix, pathTaken);
  if (result) return { ...result, pathTaken };

  return {
    answer: generateFallback(pathTaken),
    source: null,
    relevantSections: [],
    pathTaken,
    found: false,
  };
}
