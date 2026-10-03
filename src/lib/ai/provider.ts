// ============================================================
// src/lib/ai/provider.ts
// سيرفر فقط. مزوّد النموذج الوحيد للمشروع (Groq، نفس نموذج الاستجواب
// والموجّه) — لا معمارية ذكاء ثانية. نداء واحد = طلب HTTP واحد، بمهلة.
// يرجع النص الخام أو null عند أي فشل؛ المستدعي هو من يتحقق من الشكل.
// لا يُطبع أي مفتاح أو جسم طلب في السجلات.
// ============================================================

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const PROJECT_MODEL = 'qwen/qwen3.8-27b';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  /** وسم للسجلات فقط عند فشل HTTP. */
  label: string;
}

export function providerAvailable(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export async function chatCompletion(messages: ChatMessage[], opts: CompletionOptions): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: PROJECT_MODEL,
        messages,
        max_completion_tokens: opts.maxTokens,
        reasoning_effort: 'none',
        temperature: opts.temperature,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`${opts.label} MODEL ERROR:`, res.status);
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
