import { useEffect, useRef, useState } from 'react'
import { fetchConfig } from '../firestore'
import { sendChatMessage } from '../llm'
import type { AppConfig, ChatMessage, LLMConfig } from '../types'

function pickAnthropicLLM(cfg: AppConfig): LLMConfig | null {
  if (cfg.llm1.provider === 'anthropic' && cfg.llm1.apiKey) return cfg.llm1
  if (cfg.llm2.provider === 'anthropic' && cfg.llm2.apiKey) return cfg.llm2
  return null
}

// Minimal markdown renderer — bold, inline code, numbered/bullet lists, line breaks
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded text-xs font-mono">$1</code>')
    .replace(/^### (.+)$/gm, '<p class="font-semibold text-gray-800 mt-2">$1</p>')
    .replace(/^## (.+)$/gm, '<p class="font-semibold text-gray-900 mt-3">$1</p>')
    .replace(/^# (.+)$/gm, '<p class="font-bold text-gray-900 mt-3">$1</p>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/^[-*]\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n/g, '<br/>')
}

export default function ChatBotPage() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetchConfig().then((cfg) => {
      setConfig(cfg)
      setLoading(false)
    })
  }, [])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || streaming || !config) return

    const llm = pickAnthropicLLM(config)
    if (!llm) {
      setError('No Anthropic LLM configured. Go to Admin → Settings and add an Anthropic API key to LLM 1 or LLM 2.')
      return
    }

    setError('')
    setInput('')
    const newHistory: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(newHistory)
    setStreaming(true)

    // Add a placeholder assistant message that we'll stream into
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      await sendChatMessage(
        llm,
        config.systemPromptText ?? '',
        newHistory,
        text,
        (chunk) => {
          setMessages((prev) => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + chunk }
            }
            return updated
          })
        },
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Chat error')
      // Remove the empty assistant placeholder on error
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setStreaming(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        Loading…
      </div>
    )
  }

  const llm = config ? pickAnthropicLLM(config) : null
  const hasSystemPrompt = !!(config?.systemPromptText)

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] min-h-[500px]">

      {/* Config warning banner */}
      {!llm && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3 text-sm text-amber-800">
          <strong>Setup required:</strong> No Anthropic LLM is configured. Ask the admin to add an Anthropic API key in Settings.
        </div>
      )}
      {llm && !hasSystemPrompt && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-3 text-sm text-blue-700">
          No system prompt document uploaded yet. The assistant will answer general Claude questions. Upload a document in Admin → Settings to ground responses in specific material.
        </div>
      )}
      {llm && hasSystemPrompt && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-3 text-xs text-green-700 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Prompt caching active — study document loaded as system context
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-2xl">🤖</div>
            <p className="text-gray-700 font-medium">Claude Architect Study Assistant</p>
            <p className="text-sm text-gray-400">Ask anything about the Claude Architect certification — architecture, safety, APIs, or exam topics.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
              msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              {msg.role === 'user' ? 'U' : 'AI'}
            </div>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-sm'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
              }`}
            >
              {msg.role === 'assistant' ? (
                msg.content
                  ? <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  : <span className="inline-flex gap-1 items-center text-gray-400">
                      <span className="animate-bounce delay-0">●</span>
                      <span className="animate-bounce delay-75">●</span>
                      <span className="animate-bounce delay-150">●</span>
                    </span>
              ) : (
                <span>{msg.content}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">{error}</p>
      )}

      {/* Input */}
      <div className="mt-3 flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming || !llm}
          placeholder={llm ? 'Ask a question… (Enter to send, Shift+Enter for new line)' : 'LLM not configured'}
          rows={2}
          className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || streaming || !llm}
          className="h-10 w-10 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl flex items-center justify-center transition-colors shrink-0"
        >
          {streaming
            ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          }
        </button>
      </div>
      <p className="text-xs text-gray-300 text-center mt-1">Enter to send · Shift+Enter for new line</p>
    </div>
  )
}
