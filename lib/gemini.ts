import { GoogleGenAI } from '@google/genai';

const MODEL = process.env.VERTEX_AI_MODEL ?? 'gemini-2.5-flash';

function getAI() {
  const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT!,
    location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
    // Vercel: pass service account credentials directly from env var
    // Local: omit this to use GOOGLE_APPLICATION_CREDENTIALS file (ADC)
    ...(credJson ? { googleAuthOptions: { credentials: JSON.parse(credJson) } } : {}),
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
