export interface Question {
  id: string
  text: string
  options: string[]
  answer: number          // index into options[]
  explanation: string
  topic: string
  createdAt: number
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
}

export interface SessionResult {
  questionId: string
  selectedOption: number | null
  correct: boolean
  timeTaken: number       // seconds
}
