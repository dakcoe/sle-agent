import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

// Vercel 환경: 환경변수에 저장된 JSON을 임시 파일로 기록해 ADC 인증
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const keyPath = '/tmp/gcp-key.json';
  fs.writeFileSync(keyPath, process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
}

const MODEL = process.env.VERTEX_AI_MODEL ?? 'gemini-2.5-flash';

function getAI() {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT!,
    location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
  });
}

export async function callGemini(prompt: string): Promise<string> {
  const response = await getAI().models.generateContent({
    model: MODEL,
    contents: prompt,
  });
  return response.text ?? '';
}

export async function callGeminiJson(prompt: string): Promise<Record<string, unknown>> {
  const response = await getAI().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  });
  const text = response.text ?? '';
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(cleaned);
  }
}
