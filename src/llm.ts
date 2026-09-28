import type { LLMConfig, Question } from './types'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const OPENAI_API = 'https://api.openai.com/v1/chat/completions'

const SYSTEM_PROMPT = `You are an expert on the Anthropic Claude AI model architecture and certification exam.
Generate multiple-choice questions suitable for the Claude Architect certification exam.
Return ONLY a valid JSON array. Each item must have:
  "text": the question text,
  "options": array of 4 answer strings (A–D),
  "answer": 0-based index of the correct option,
  "explanation": a concise explanation of why that answer is correct,
  "topic": a short topic label (e.g. "Constitutional AI", "Context Window", "Safety")
No markdown, no extra text — just the JSON array.`

export async function generateQuestions(
  llm: LLMConfig,
  count: number,
  topic?: string,
): Promise<Omit<Question, 'id' | 'createdAt'>[]> {
  const userMsg = `Generate ${count} unique Claude architect certification questions${topic ? ` on the topic: ${topic}` : ''}.`

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
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Anthropic error ${res.status}: ${err}`)
    }
    const data = await res.json()
    const text = data.content?.[0]?.text ?? ''
    return JSON.parse(text)
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
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI error ${res.status}: ${err}`)
    }
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content ?? ''
    return JSON.parse(text)
  }

  throw new Error('No LLM configured')
}
