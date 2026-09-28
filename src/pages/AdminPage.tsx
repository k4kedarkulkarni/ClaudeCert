import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  fetchQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  fetchConfig,
  saveConfig,
  uploadInstructorPdf,
} from '../firestore'
import { generateQuestions, extractQuestionsFromPdf, extractTextFromPdf } from '../llm'
import type { AppConfig, LLMConfig, Question } from '../types'

const DEFAULT_CONFIG: AppConfig = {
  llm1: { provider: 'anthropic', apiKey: '', model: 'claude-opus-4-5' },
  llm2: { provider: 'openai', apiKey: '', model: 'gpt-4o' },
  defaultQuestionCount: 10,
  instructorPdfUrl: '',
}

// ── Small reusable components ────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  )
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  )
}

function Textarea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
      />
    </div>
  )
}

// ── LLM Config Panel ────────────────────────────────────────────────────────

function LLMPanel({
  label,
  cfg,
  onChange,
}: {
  label: string
  cfg: LLMConfig
  onChange: (c: LLMConfig) => void
}) {
  const providers = ['anthropic', 'openai', 'none'] as const
  return (
    <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
        <select
          value={cfg.provider}
          onChange={(e) => onChange({ ...cfg, provider: e.target.value as LLMConfig['provider'] })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          {providers.map((p) => (
            <option key={p} value={p}>{p === 'none' ? 'Disabled' : p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>
      </div>
      {cfg.provider !== 'none' && (
        <>
          <Input
            label="API Key"
            value={cfg.apiKey}
            onChange={(v) => onChange({ ...cfg, apiKey: v })}
            type="password"
            placeholder="sk-…"
          />
          <Input
            label="Model"
            value={cfg.model}
            onChange={(v) => onChange({ ...cfg, model: v })}
            placeholder={cfg.provider === 'anthropic' ? 'claude-opus-4-5' : 'gpt-4o'}
          />
        </>
      )}
    </div>
  )
}

// ── Question Form (add / edit) ───────────────────────────────────────────────

const EMPTY_FORM = {
  text: '',
  options: ['', '', '', ''],
  answer: 0,
  explanation: '',
  topic: '',
}

function QuestionForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: typeof EMPTY_FORM
  onSave: (q: typeof EMPTY_FORM) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState(initial)
  const optionLetters = ['A', 'B', 'C', 'D']

  return (
    <div className="space-y-3">
      <Textarea
        label="Question text"
        value={form.text}
        onChange={(v) => setForm({ ...form, text: v })}
        rows={3}
      />
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-600">Options (select correct answer)</label>
        {form.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, answer: i })}
              className={`shrink-0 w-7 h-7 rounded-full text-xs font-semibold border-2 transition-colors ${
                form.answer === i
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'border-gray-300 text-gray-400'
              }`}
            >
              {optionLetters[i]}
            </button>
            <input
              type="text"
              value={opt}
              onChange={(e) => {
                const opts = [...form.options]
                opts[i] = e.target.value
                setForm({ ...form, options: opts })
              }}
              placeholder={`Option ${optionLetters[i]}`}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        ))}
      </div>
      <Textarea
        label="Explanation"
        value={form.explanation}
        onChange={(v) => setForm({ ...form, explanation: v })}
        rows={2}
      />
      <Input
        label="Topic"
        value={form.topic}
        onChange={(v) => setForm({ ...form, topic: v })}
        placeholder="e.g. Constitutional AI"
      />
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.text || form.options.some((o) => !o)}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium rounded-lg py-2 text-sm transition-colors"
        >
          {saving ? 'Saving…' : 'Save Question'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Admin Page ────────────────────────────────────────────────────────────────

type AdminTab = 'questions' | 'config' | 'generate'

export default function AdminPage() {
  const { user, logout } = useAuth()
  if (!user) return <Navigate to="/admin/login" replace />

  const [tab, setTab] = useState<AdminTab>('questions')
  const [questions, setQuestions] = useState<Question[]>([])
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [loadingData, setLoadingData] = useState(true)

  // question management state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // config state
  const [savingConfig, setSavingConfig] = useState(false)
  const [configMsg, setConfigMsg] = useState('')

  // PDF upload state
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [pdfMsg, setPdfMsg] = useState('')

  // PDF import state (question bank)
  const [importingPdf, setImportingPdf] = useState(false)
  const [importResults, setImportResults] = useState<Omit<Question, 'id' | 'createdAt'>[]>([])
  const [importError, setImportError] = useState('')
  const [importMsg, setImportMsg] = useState('')

  // AI generation state
  const [genCount, setGenCount] = useState(5)
  const [genTopic, setGenTopic] = useState('')
  const [genLlm, setGenLlm] = useState<'llm1' | 'llm2'>('llm1')
  const [generating, setGenerating] = useState(false)
  const [genResults, setGenResults] = useState<Omit<Question, 'id' | 'createdAt'>[]>([])
  const [genError, setGenError] = useState('')

  useEffect(() => {
    Promise.all([fetchQuestions(), fetchConfig()]).then(([qs, cfg]) => {
      setQuestions(qs)
      if (cfg) setConfig(cfg)
      setLoadingData(false)
    })
  }, [])

  // ── Config actions ──────────────────────────────────────────────────────────

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    setConfigMsg('')
    try {
      await saveConfig(config)
      setConfigMsg('Configuration saved.')
    } catch {
      setConfigMsg('Error saving config.')
    } finally {
      setSavingConfig(false)
    }
  }

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPdf(true)
    setPdfMsg('')
    try {
      const url = await uploadInstructorPdf(file)
      const updated = { ...config, instructorPdfUrl: url }
      setConfig(updated)
      await saveConfig(updated)
      setPdfMsg('PDF uploaded and saved.')
    } catch {
      setPdfMsg('Upload failed.')
    } finally {
      setUploadingPdf(false)
    }
  }

  // ── Question actions ────────────────────────────────────────────────────────

  const handleAdd = async (form: typeof EMPTY_FORM) => {
    setSaving(true)
    try {
      const id = await addQuestion({ ...form, createdAt: Date.now() })
      setQuestions([{ id, ...form, createdAt: Date.now() }, ...questions])
      setShowAddForm(false)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (id: string, form: typeof EMPTY_FORM) => {
    setSaving(true)
    try {
      await updateQuestion(id, form)
      setQuestions(questions.map((q) => (q.id === id ? { ...q, ...form } : q)))
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await deleteQuestion(id)
    setQuestions(questions.filter((q) => q.id !== id))
    setDeleteConfirm(null)
  }

  // ── PDF question bank import ────────────────────────────────────────────────

  const handleImportPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Need a configured LLM to parse the PDF
    const llmCfg = config.llm1.provider !== 'none' ? config.llm1 : config.llm2
    if (llmCfg.provider === 'none' || !llmCfg.apiKey) {
      setImportError('Configure at least one LLM in Settings before importing.')
      return
    }
    setImportingPdf(true)
    setImportError('')
    setImportMsg('')
    setImportResults([])
    // Reset the file input so the same file can be re-selected if needed
    e.target.value = ''
    try {
      const text = await extractTextFromPdf(file)
      const parsed = await extractQuestionsFromPdf(llmCfg, text)
      if (parsed.length === 0) {
        setImportError('No questions could be extracted from this PDF. Check the format.')
      } else {
        setImportResults(parsed)
        setImportMsg(`${parsed.length} questions extracted — review and add to bank below.`)
      }
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImportingPdf(false)
    }
  }

  const handleAddImported = async (q: Omit<Question, 'id' | 'createdAt'>) => {
    const id = await addQuestion({ ...q, createdAt: Date.now() })
    setQuestions((prev) => [{ id, ...q, createdAt: Date.now() }, ...prev])
    setImportResults((prev) => prev.filter((r) => r !== q))
  }

  const handleAddAllImported = async () => {
    for (const q of importResults) {
      const id = await addQuestion({ ...q, createdAt: Date.now() })
      setQuestions((prev) => [{ id, ...q, createdAt: Date.now() }, ...prev])
    }
    setImportResults([])
    setImportMsg('All questions added to the bank.')
  }

  // ── AI generation actions ───────────────────────────────────────────────────

  const handleGenerate = async () => {
    const llmCfg = config[genLlm]
    if (!llmCfg || llmCfg.provider === 'none') {
      setGenError('Selected LLM is not configured.')
      return
    }
    setGenerating(true)
    setGenError('')
    setGenResults([])
    try {
      // Pass a random sample of existing questions as few-shot style examples
      const shuffled = [...questions].sort(() => Math.random() - 0.5)
      const results = await generateQuestions(llmCfg, genCount, genTopic || undefined, shuffled.slice(0, 3))
      setGenResults(results)
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const handleAddGenerated = async (q: Omit<Question, 'id' | 'createdAt'>) => {
    const id = await addQuestion({ ...q, createdAt: Date.now() })
    setQuestions([{ id, ...q, createdAt: Date.now() }, ...questions])
    setGenResults(genResults.filter((r) => r !== q))
  }

  const handleAddAllGenerated = async () => {
    for (const q of genResults) {
      const id = await addQuestion({ ...q, createdAt: Date.now() })
      setQuestions((prev) => [{ id, ...q, createdAt: Date.now() }, ...prev])
    }
    setGenResults([])
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'questions', label: `Questions (${questions.length})` },
    { id: 'config', label: 'Settings' },
    { id: 'generate', label: 'AI Generate' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Admin Panel</h1>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
          <button
            onClick={logout}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            Sign out
          </button>
        </div>
        {/* Tabs */}
        <div className="max-w-3xl mx-auto px-4 flex gap-1 pb-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-sm px-4 py-2 border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'border-indigo-600 text-indigo-600 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {loadingData ? (
          <p className="text-sm text-gray-400 text-center py-10">Loading…</p>
        ) : (

          /* ── Questions Tab ─────────────────────────────────────────────── */
          tab === 'questions' ? (
            <>
              <div className="flex gap-2 justify-end flex-wrap">
                {/* PDF question bank import */}
                <label className={`cursor-pointer inline-flex items-center gap-2 border border-indigo-300 text-indigo-600 hover:bg-indigo-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${importingPdf ? 'opacity-50 pointer-events-none' : ''}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {importingPdf ? 'Importing…' : 'Import PDF Bank'}
                  <input type="file" accept="application/pdf" className="hidden" onChange={handleImportPdf} disabled={importingPdf} />
                </label>
                <button
                  onClick={() => setShowAddForm(true)}
                  disabled={showAddForm}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  + Add Question
                </button>
              </div>

              {/* Import status / errors */}
              {importError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{importError}</p>
              )}
              {importMsg && importResults.length === 0 && (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">{importMsg}</p>
              )}

              {/* Extracted questions preview */}
              {importResults.length > 0 && (
                <SectionCard title={`📄 Imported from PDF — ${importResults.length} questions to review`}>
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">Review each question before adding to the bank. Edit manually if needed after adding.</p>
                    <button
                      onClick={handleAddAllImported}
                      className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                    >
                      Add All {importResults.length} Questions to Bank
                    </button>
                    {importResults.map((q, i) => (
                      <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
                        <p className="text-sm font-medium text-gray-900">{q.text}</p>
                        {q.topic && (
                          <span className="inline-block text-xs bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5">{q.topic}</span>
                        )}
                        <div className="space-y-1">
                          {q.options.map((opt, j) => (
                            <div key={j} className={`text-xs rounded-lg px-3 py-1.5 flex gap-2 ${j === q.answer ? 'bg-green-50 text-green-700 font-medium' : 'bg-white text-gray-500'}`}>
                              <span>{['A','B','C','D'][j]}.</span>
                              <span>{opt}</span>
                            </div>
                          ))}
                        </div>
                        {q.explanation && <p className="text-xs text-gray-400 italic">{q.explanation}</p>}
                        <button
                          onClick={() => handleAddImported(q)}
                          className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          Add to Bank
                        </button>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {showAddForm && (
                <SectionCard title="New Question">
                  <QuestionForm
                    initial={EMPTY_FORM}
                    onSave={handleAdd}
                    onCancel={() => setShowAddForm(false)}
                    saving={saving}
                  />
                </SectionCard>
              )}

              {questions.length === 0 && !showAddForm && (
                <p className="text-sm text-gray-400 text-center py-10">No questions yet. Add one or use AI Generate.</p>
              )}

              {questions.map((q) => (
                <div
                  key={q.id}
                  className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm"
                >
                  {editingId === q.id ? (
                    <>
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Editing</h4>
                      <QuestionForm
                        initial={{
                          text: q.text,
                          options: q.options,
                          answer: q.answer,
                          explanation: q.explanation,
                          topic: q.topic,
                        }}
                        onSave={(form) => handleUpdate(q.id, form)}
                        onCancel={() => setEditingId(null)}
                        saving={saving}
                      />
                    </>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 leading-snug">{q.text}</p>
                          {q.topic && (
                            <span className="inline-block mt-1 text-xs bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5">
                              {q.topic}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => setEditingId(q.id)}
                            className="text-xs px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(q.id)}
                            className="text-xs px-2 py-1 border border-red-200 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-1">
                        {q.options.map((opt, i) => (
                          <div
                            key={i}
                            className={`text-xs rounded-lg px-3 py-1.5 flex gap-2 ${
                              i === q.answer
                                ? 'bg-green-50 text-green-700 font-medium'
                                : 'bg-gray-50 text-gray-500'
                            }`}
                          >
                            <span>{['A', 'B', 'C', 'D'][i]}.</span>
                            <span>{opt}</span>
                          </div>
                        ))}
                      </div>
                      {q.explanation && (
                        <p className="mt-2 text-xs text-gray-400 italic">{q.explanation}</p>
                      )}

                      {deleteConfirm === q.id && (
                        <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between gap-3">
                          <p className="text-xs text-red-700 font-medium">Delete this question?</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDelete(q.id)}
                              className="text-xs bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 transition-colors"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-xs border border-gray-300 px-3 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </>

          /* ── Config Tab ─────────────────────────────────────────────────── */
          ) : tab === 'config' ? (
            <>
              <SectionCard title="LLM Configuration">
                <div className="space-y-4">
                  <LLMPanel
                    label="LLM 1 (Primary)"
                    cfg={config.llm1}
                    onChange={(c) => setConfig({ ...config, llm1: c })}
                  />
                  <LLMPanel
                    label="LLM 2 (Secondary)"
                    cfg={config.llm2}
                    onChange={(c) => setConfig({ ...config, llm2: c })}
                  />
                </div>
              </SectionCard>

              <SectionCard title="Session Defaults">
                <Input
                  label="Default number of questions per session"
                  value={String(config.defaultQuestionCount)}
                  onChange={(v) => setConfig({ ...config, defaultQuestionCount: Number(v) || 10 })}
                  type="number"
                />
              </SectionCard>

              <SectionCard title="Instructor Guide PDF">
                <div className="space-y-3">
                  {config.instructorPdfUrl && (
                    <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                      ✓ PDF currently uploaded
                    </p>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Upload new PDF</label>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handlePdfUpload}
                      disabled={uploadingPdf}
                      className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 transition-colors"
                    />
                  </div>
                  {uploadingPdf && <p className="text-xs text-gray-400">Uploading…</p>}
                  {pdfMsg && <p className="text-xs text-green-700">{pdfMsg}</p>}
                </div>
              </SectionCard>

              {configMsg && (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                  {configMsg}
                </p>
              )}

              <button
                onClick={handleSaveConfig}
                disabled={savingConfig}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
              >
                {savingConfig ? 'Saving…' : 'Save All Settings'}
              </button>
            </>

          /* ── Generate Tab ────────────────────────────────────────────────── */
          ) : (
            <>
              <SectionCard title="AI Question Generator">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Number to generate</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={genCount}
                        onChange={(e) => setGenCount(Math.max(1, Math.min(20, Number(e.target.value))))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">LLM to use</label>
                      <select
                        value={genLlm}
                        onChange={(e) => setGenLlm(e.target.value as 'llm1' | 'llm2')}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      >
                        <option value="llm1">LLM 1 — {config.llm1.provider} ({config.llm1.model || 'unconfigured'})</option>
                        <option value="llm2">LLM 2 — {config.llm2.provider} ({config.llm2.model || 'unconfigured'})</option>
                      </select>
                    </div>
                  </div>
                  <Input
                    label="Topic (optional)"
                    value={genTopic}
                    onChange={setGenTopic}
                    placeholder="e.g. Constitutional AI, Safety, Context Windows"
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
                  >
                    {generating ? '⏳ Generating…' : '✨ Generate Questions'}
                  </button>
                  {genError && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{genError}</p>
                  )}
                </div>
              </SectionCard>

              {genResults.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">{genResults.length} questions generated</p>
                    <button
                      onClick={handleAddAllGenerated}
                      className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg font-medium transition-colors"
                    >
                      Add All to Bank
                    </button>
                  </div>

                  {genResults.map((q, i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3">
                      <p className="text-sm font-medium text-gray-900">{q.text}</p>
                      {q.topic && (
                        <span className="inline-block text-xs bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5">{q.topic}</span>
                      )}
                      <div className="space-y-1">
                        {q.options.map((opt, j) => (
                          <div
                            key={j}
                            className={`text-xs rounded-lg px-3 py-1.5 flex gap-2 ${
                              j === q.answer
                                ? 'bg-green-50 text-green-700 font-medium'
                                : 'bg-gray-50 text-gray-500'
                            }`}
                          >
                            <span>{['A', 'B', 'C', 'D'][j]}.</span>
                            <span>{opt}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 italic">{q.explanation}</p>
                      <button
                        onClick={() => handleAddGenerated(q)}
                        className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        Add to Question Bank
                      </button>
                    </div>
                  ))}
                </>
              )}
            </>
          )
        )}
      </div>
    </div>
  )
}
