import mammoth from 'mammoth';

// pdf-parse has no default export typing; use require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

export async function parseBuffer(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return parsePdf(buffer);
  if (ext === 'docx') return parseDocx(buffer);
  if (ext === 'txt') return buffer.toString('utf-8');
  throw new Error(`Unsupported file type: ${ext}`);
}

export async function getChunks(buffer: Buffer, filename: string): Promise<string[]> {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return getPdfChunks(buffer);
  if (ext === 'docx') return getDocxChunks(buffer);
  if (ext === 'txt') {
    const text = buffer.toString('utf-8');
    return text.trim() ? [text] : [];
  }
  throw new Error(`Unsupported file type: ${ext}`);
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function getPdfChunks(buffer: Buffer): Promise<string[]> {
  const chunks: string[] = [];
  let pageNum = 1;

  // Parse page by page using per-page render callback
  await pdfParse(buffer, {
    pagerender: (pageData: { getTextContent: (opts: { normalizeWhitespace: boolean }) => Promise<{ items: Array<{ str: string; transform: number[] }> }> }) => {
      return pageData.getTextContent({ normalizeWhitespace: true }).then(
        (content: { items: Array<{ str: string; transform: number[] }> }) => {
          const lines: string[] = [];
          let lastY: number | null = null;
          for (const item of content.items) {
            const y = item.transform[5];
            if (lastY !== null && Math.abs(y - lastY) > 2) lines.push('\n');
            lines.push(item.str);
            lastY = y;
          }
          const text = lines.join(' ').trim();
          if (text) chunks.push(text);
          pageNum++;
          return text;
        }
      );
    },
  });

  // Fallback: if page render didn't produce chunks, split full text by form feed
  if (chunks.length === 0) {
    const data = await pdfParse(buffer);
    return data.text.split('\f').map((p: string) => p.trim()).filter(Boolean);
  }

  return chunks;
}

async function getDocxChunks(buffer: Buffer): Promise<string[]> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value;
  // Split by double newlines (paragraphs) into reasonable chunks
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > 3000 && current) {
      chunks.push(current);
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}
