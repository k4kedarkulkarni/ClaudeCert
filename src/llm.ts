import type { LLMConfig, Question } from './types'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const OPENAI_API = 'https://api.openai.com/v1/chat/completions'

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Call whichever provider is configured and return the assistant text. */
async function callLLM(llm: LLMConfig, system: string, user: string): Promise<string> {
  if (llm.provider === 'anthropic') {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': llm.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: llm.model || 'claude-opus-4-5',
        max_tokens: 8192,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`)
    const data = await res.json()
    return data.content?.[0]?.text ?? ''
  }

  if (llm.provider === 'openai') {
    const res = await fetch(OPENAI_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: llm.model || 'gpt-4o',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  }

  throw new Error('No LLM configured')
}

/** Parse a JSON array out of an LLM response, stripping any markdown fences. */
function parseJsonArray(text: string): unknown[] {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  // Find the first '[' and last ']' to be robust to extra prose
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1) throw new Error('No JSON array found in LLM response')
  return JSON.parse(cleaned.slice(start, end + 1))
}

// ── Extract text from a PDF file using pdfjs-dist ────────────────────────────

export async function extractTextFromPdf(file: File): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((item: unknown) => (item as { str: string }).str).join(' '))
  }
  return pages.join('\n\n')
}

// ── Parse questions out of raw PDF text via LLM ──────────────────────────────

const EXTRACT_SYSTEM = `You are an expert at parsing certification exam question banks from raw text.
Extract every multiple-choice question you find in the provided text.
Return ONLY a valid JSON array. Each item must have:
  "text": the question text,
  "options": array of exactly 4 answer strings,
  "answer": 0-based index of the correct option,
  "explanation": a brief explanation of why that answer is correct (infer if not stated),
  "topic": a short topic label
If the text does not contain 4 options for a question, skip that question.
No markdown, no prose — just the raw JSON array.`

export async function extractQuestionsFromPdf(
  llm: LLMConfig,
  pdfText: string,
): Promise<Omit<Question, 'id' | 'createdAt'>[]> {
  // Truncate to ~12 000 chars to stay within typical context limits for a single call
  const truncated = pdfText.slice(0, 12000)
  const userMsg = `Extract all multiple-choice questions from the following exam text:\n\n${truncated}`
  const raw = await callLLM(llm, EXTRACT_SYSTEM, userMsg)
  return parseJsonArray(raw) as Omit<Question, 'id' | 'createdAt'>[]
}

// ── Generate new questions (with optional few-shot examples) ──────────────────

const GENERATE_SYSTEM = `You are an expert on the Anthropic Claude AI model architecture and certification exam.
Generate multiple-choice questions suitable for the Claude Architect certification exam.
Return ONLY a valid JSON array. Each item must have:
  "text": the question text,
  "options": array of exactly 4 answer strings (A–D),
  "answer": 0-based index of the correct option,
  "explanation": a concise explanation of why that answer is correct,
  "topic": a short topic label (e.g. "Constitutional AI", "Context Window", "Safety")
No markdown, no extra text — just the JSON array.`

export async function generateQuestions(
  llm: LLMConfig,
  count: number,
  topic?: string,
  sampleQuestions?: Omit<Question, 'id' | 'createdAt'>[],
): Promise<Omit<Question, 'id' | 'createdAt'>[]> {
  let userMsg = `Generate ${count} unique Claude architect certification questions${topic ? ` on the topic: ${topic}` : ''}.`

  if (sampleQuestions && sampleQuestions.length > 0) {
    // Use up to 3 samples as few-shot examples so the LLM matches style/difficulty
    const samples = sampleQuestions.slice(0, 3)
    const examplesJson = JSON.stringify(samples, null, 2)
    userMsg += `\n\nHere are ${samples.length} example question(s) from the existing question bank — match their style, difficulty, and format:\n${examplesJson}`
  }

  const raw = await callLLM(llm, GENERATE_SYSTEM, userMsg)
  return parseJsonArray(raw) as Omit<Question, 'id' | 'createdAt'>[]
}
