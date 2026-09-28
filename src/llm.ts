import type { LLMConfig, ChatMessage, Question } from './types'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const OPENAI_API = 'https://api.openai.com/v1/chat/completions'

// ── Shared helpers ────────────────────────────────────────────────────────────

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

function parseJsonArray(text: string): unknown[] {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
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

// Extract text from a PDF URL (for study guide already uploaded to Storage)
export async function extractTextFromPdfUrl(url: string): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const pdf = await getDocument({ url }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((item: unknown) => (item as { str: string }).str).join(' '))
  }
  return pages.join('\n\n')
}

// ── Extract text from any uploaded file (PDF, TXT, MD) ───────────────────────

export async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === 'application/pdf') {
    return extractTextFromPdf(file)
  }
  // Plain text / markdown
  return file.text()
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
  const truncated = pdfText.slice(0, 12000)
  const userMsg = `Extract all multiple-choice questions from the following exam text:\n\n${truncated}`
  const raw = await callLLM(llm, EXTRACT_SYSTEM, userMsg)
  return parseJsonArray(raw) as Omit<Question, 'id' | 'createdAt'>[]
}

// ── Generate new questions ────────────────────────────────────────────────────

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
  studyGuideText?: string,
): Promise<Omit<Question, 'id' | 'createdAt'>[]> {
  let userMsg = `Generate ${count} unique Claude architect certification questions${topic ? ` on the topic: ${topic}` : ''}.`

  if (studyGuideText) {
    // Truncate to ~8000 chars to leave room for samples + response
    const truncated = studyGuideText.slice(0, 8000)
    userMsg += `\n\nUse the following study guide material as your primary source — questions must be grounded in this content:\n\n---\n${truncated}\n---`
  }

  if (sampleQuestions && sampleQuestions.length > 0) {
    const samples = sampleQuestions.slice(0, 3)
    userMsg += `\n\nMatch the style and difficulty of these existing questions:\n${JSON.stringify(samples, null, 2)}`
  }

  const raw = await callLLM(llm, GENERATE_SYSTEM, userMsg)
  return parseJsonArray(raw) as Omit<Question, 'id' | 'createdAt'>[]
}

// ── Chatbot with Anthropic prompt caching ────────────────────────────────────

/**
 * Send a chat message using the Anthropic Messages API with prompt caching.
 * The systemPromptText is sent with cache_control: ephemeral on the first
 * content block, so it is cached server-side for 5 minutes between turns.
 * onChunk is called progressively with streaming text deltas.
 */
export async function sendChatMessage(
  llm: LLMConfig,
  systemPromptText: string,
  history: ChatMessage[],
  userMessage: string,
  onChunk: (delta: string) => void,
): Promise<string> {
  if (llm.provider !== 'anthropic') {
    throw new Error('The chatbot requires an Anthropic (Claude) LLM. Configure LLM 1 or LLM 2 with provider = anthropic.')
  }

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ]

  // System content with cache_control on the large document block
  const systemBlocks = systemPromptText
    ? [
        {
          type: 'text',
          text: systemPromptText,
          cache_control: { type: 'ephemeral' },   // Anthropic prompt caching
        },
        {
          type: 'text',
          text: 'You are a helpful Claude Architect certification study assistant. Answer questions clearly and concisely based on the study material above.',
        },
      ]
    : 'You are a helpful Claude Architect certification study assistant.'

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': llm.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: llm.model || 'claude-opus-4-5',
      max_tokens: 2048,
      system: systemBlocks,
      messages,
      stream: true,
    }),
  })

  if (!res.ok) {
    throw new Error(`Anthropic error ${res.status}: ${await res.text()}`)
  }

  // Parse the SSE stream
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]' || !raw) continue
      try {
        const evt = JSON.parse(raw)
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          const chunk = evt.delta.text as string
          fullText += chunk
          onChunk(chunk)
        }
      } catch {
        // ignore malformed lines
      }
    }
  }

  return fullText
}
