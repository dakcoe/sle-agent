import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { callGeminiJson } from '@/lib/gemini';
import { normalizeTree, TreeNode } from '@/lib/categorizer';

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { trees, filenames } = await req.json() as {
    trees: TreeNode[][];
    filenames: string[];
  };

  if (!trees?.length) {
    return NextResponse.json({ tree: [] });
  }
  if (trees.length === 1) {
    return NextResponse.json({ tree: trees[0] });
  }

  const treesText = trees.map((tree, i) =>
    `[파일: ${filenames[i]}]\n${JSON.stringify(tree, null, 2)}`
  ).join('\n\n');

  const prompt = `다음은 여러 문서에서 각각 생성된 카테고리 트리들이야.
이것들을 하나의 통합된 계층적 카테고리 트리로 병합해줘.

규칙:
- 유사한 분류는 합치고, 중복은 제거해
- 각 문서의 고유한 내용은 별도 분기로 유지해
- 최대 4단계 깊이 유지
- 폴더명/파일명은 한국어로

${treesText}

JSON으로만 응답:
{"tree": [{"name": "폴더명", "children": [{"name": "파일명"}]}]}`;

  const result = await callGeminiJson(prompt);
  const raw = (result.tree as TreeNode[]) || [];
  return NextResponse.json({ tree: normalizeTree(raw) });
}
