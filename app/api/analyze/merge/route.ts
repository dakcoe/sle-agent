import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { callGeminiJson } from '@/lib/gemini';
import { normalizeTree, TreeNode } from '@/lib/categorizer';

const BATCH_SIZE = 8;

async function mergeTreesBatch(trees: TreeNode[][], labels: string[]): Promise<TreeNode[]> {
  const treesText = trees
    .map((tree, i) => `[${labels[i]}]\n${JSON.stringify(tree, null, 2)}`)
    .join('\n\n');

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
  return normalizeTree((result.tree as TreeNode[]) || []);
}

async function hierarchicalMerge(trees: TreeNode[][], labels: string[]): Promise<TreeNode[]> {
  if (!trees.length) return [];
  if (trees.length === 1) return trees[0];

  let currentTrees = trees;
  let currentLabels = labels;

  while (currentTrees.length > 1) {
    const nextTrees: TreeNode[][] = [];
    const nextLabels: string[] = [];

    for (let i = 0; i < currentTrees.length; i += BATCH_SIZE) {
      const batchTrees = currentTrees.slice(i, i + BATCH_SIZE);
      const batchLabels = currentLabels.slice(i, i + BATCH_SIZE);
      if (batchTrees.length === 1) {
        nextTrees.push(batchTrees[0]);
        nextLabels.push(batchLabels[0]);
      } else {
        const merged = await mergeTreesBatch(batchTrees, batchLabels);
        nextTrees.push(merged);
        nextLabels.push(batchLabels.join(', '));
      }
    }

    currentTrees = nextTrees;
    currentLabels = nextLabels;
  }

  return currentTrees[0];
}

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

  const labels = filenames?.length === trees.length
    ? filenames
    : trees.map((_, i) => `문서 ${i + 1}`);

  const merged = await hierarchicalMerge(trees, labels);
  return NextResponse.json({ tree: merged });
}
