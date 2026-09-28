export interface Question {
  id: string
  text: string
  options: string[]
  answer: number          // index into options[]
  explanation: string
  topic: string
  createdAt: number
  disabled?: boolean      // if true, excluded from all sessions
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'none'
  apiKey: string
  model: string
}

export interface AppConfig {
  llm1: LLMConfig
  llm2: LLMConfig
  defaultQuestionCount: number
  instructorPdfUrl: string
  studyGuideUrl: string        // PDF used as source for question generation
  systemPromptText: string     // full text of the chatbot system prompt document
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface SessionResult {
  questionId: string
  selectedOption: number | null
  correct: boolean
  timeTaken: number       // seconds
}
