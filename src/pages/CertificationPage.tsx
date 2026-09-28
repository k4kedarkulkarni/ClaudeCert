import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchConfig, fetchQuestions, updateQuestion } from '../firestore'
import type { AppConfig, Question, SessionResult } from '../types'

const TIMER_SECONDS = 60

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Toggle helper ─────────────────────────────────────────────────────────────

function Toggle({
  value,
  onChange,
}: {
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        value ? 'bg-indigo-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

// ── Setup Screen ─────────────────────────────────────────────────────────────

function SetupScreen({
  totalAvailable,
  defaultCount,
  onStart,
}: {
  totalAvailable: number
  defaultCount: number
  onStart: (count: number, explanations: boolean, timerEnabled: boolean) => void
}) {
  const [count, setCount] = useState(Math.min(defaultCount, totalAvailable))
  const [explanations, setExplanations] = useState(true)
  const [timerEnabled, setTimerEnabled] = useState(true)

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 gap-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-900">Certification Practice</h2>
        <p className="text-sm text-gray-500 mt-1">Claude Architect Exam</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-sm shadow-sm space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of questions{' '}
            <span className="text-gray-400 font-normal">({totalAvailable} available)</span>
          </label>
          <input
            type="number"
            min={1}
            max={totalAvailable}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(totalAvailable, Number(e.target.value))))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">60-second timer</p>
            <p className="text-xs text-gray-400">Auto-advance when time runs out</p>
          </div>
          <Toggle value={timerEnabled} onChange={setTimerEnabled} />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Explanation mode</p>
            <p className="text-xs text-gray-400">Show answer explanation after each question</p>
          </div>
          <Toggle value={explanations} onChange={setExplanations} />
        </div>

        {!timerEnabled && (
          <div className="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2">
            ← → Use Next / Back buttons to navigate questions
          </div>
        )}
        {timerEnabled && (
          <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
            ⏱ 60 seconds per question
          </div>
        )}

        <button
          onClick={() => onStart(count, explanations, timerEnabled)}
          disabled={totalAvailable === 0}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
        >
          {totalAvailable === 0 ? 'No questions available' : 'Start Session'}
        </button>
      </div>
    </div>
  )
}

// ── Timer Ring ────────────────────────────────────────────────────────────────

function TimerRing({ seconds }: { seconds: number }) {
  const r = 22
  const circumference = 2 * Math.PI * r
  const progress = (seconds / TIMER_SECONDS) * circumference
  const color = seconds > 20 ? '#4f46e5' : seconds > 10 ? '#f59e0b' : '#ef4444'

  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
      <circle
        cx="28" cy="28" r={r} fill="none"
        stroke={color} strokeWidth="4"
        strokeDasharray={`${progress} ${circumference}`}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
        style={{ transition: 'stroke-dasharray 0.5s linear, stroke 0.5s' }}
      />
      <text x="28" y="33" textAnchor="middle" fontSize="14" fontWeight="600" fill={color}>{seconds}</text>
    </svg>
  )
}

// ── Question Card ────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  index,
  total,
  explanationsOn,
  timerEnabled,
  existingResult,
  onAnswer,
  onNext,
  onBack,
  onDisable,
}: {
  question: Question
  index: number
  total: number
  explanationsOn: boolean
  timerEnabled: boolean
  existingResult: SessionResult | undefined   // set when revisiting a question
  onAnswer: (optionIdx: number | null, timeTaken: number) => void
  onNext: () => void
  onBack: () => void
  onDisable: () => void
}) {
  const [selected, setSelected] = useState<number | null>(existingResult?.selectedOption ?? null)
  const [revealed, setRevealed] = useState(existingResult !== undefined)
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS)
  const startTime = useRef(Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const submit = useCallback(
    (optionIdx: number | null) => {
      if (timerRef.current) clearInterval(timerRef.current)
      const timeTaken = Math.round((Date.now() - startTime.current) / 1000)
      setRevealed(true)
      onAnswer(optionIdx, timeTaken)
    },
    [onAnswer],
  )

  // Start timer only when timer mode is on and question hasn't been answered yet
  useEffect(() => {
    if (!timerEnabled || revealed) return
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          submit(null)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerEnabled, revealed, submit])

  const optionLetters = ['A', 'B', 'C', 'D']
  const isLast = index === total - 1

  return (
    <div className="flex flex-col gap-4 px-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          Question {index + 1} of {total}
        </span>
        {timerEnabled
          ? <TimerRing seconds={timeLeft} />
          : <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">No timer</span>
        }
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-1">
        <div
          className="bg-indigo-500 h-1 rounded-full transition-all"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      {/* Question text */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <p className="text-gray-900 text-sm leading-relaxed font-medium">{question.text}</p>
        {question.topic && (
          <span className="inline-block mt-2 text-xs bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5">
            {question.topic}
          </span>
        )}
      </div>

      {/* Options */}
      <div className="space-y-2">
        {question.options.map((opt, i) => {
          let cls = 'border border-gray-200 bg-white text-gray-800'
          if (revealed) {
            if (i === question.answer) cls = 'border-green-500 bg-green-50 text-green-800'
            else if (i === selected) cls = 'border-red-400 bg-red-50 text-red-700'
            else cls = 'border-gray-200 bg-gray-50 text-gray-400'
          } else if (i === selected) {
            cls = 'border-indigo-500 bg-indigo-50 text-indigo-800'
          }
          return (
            <button
              key={i}
              disabled={revealed}
              onClick={() => {
                setSelected(i)
                submit(i)
              }}
              className={`w-full text-left rounded-xl px-4 py-3 text-sm transition-colors ${cls} flex items-start gap-3`}
            >
              <span className="font-semibold shrink-0">{optionLetters[i]}.</span>
              <span>{opt}</span>
            </button>
          )
        })}
      </div>

      {/* Explanation */}
      {revealed && explanationsOn && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 leading-relaxed">
          <p className="font-semibold mb-1">Explanation</p>
          <p>{question.explanation}</p>
        </div>
      )}

      {/* Timeout notice (timer mode only) */}
      {timerEnabled && revealed && selected === null && (
        <p className="text-center text-sm text-amber-600 font-medium">Time's up!</p>
      )}

      {/* Manual navigation + mark irrelevant (no-timer mode) */}
      {!timerEnabled && (
        <>
          {/* Mark as irrelevant checkbox — only show after answering */}
          {revealed && (
            <label className="flex items-center gap-2 cursor-pointer select-none self-start">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-gray-300 accent-rose-500 cursor-pointer"
                onChange={(e) => { if (e.target.checked) onDisable() }}
              />
              <span className="text-xs text-gray-500 hover:text-rose-600 transition-colors">
                Mark as irrelevant — remove from future sessions
              </span>
            </label>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onBack}
              disabled={index === 0}
              className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
            >
              ← Back
            </button>
            <button
              onClick={onNext}
              disabled={!revealed}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1"
            >
              {isLast ? 'Finish →' : 'Next →'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Summary Screen ────────────────────────────────────────────────────────────

function SummaryScreen({
  results,
  questions,
  onRestart,
}: {
  results: SessionResult[]
  questions: Question[]
  onRestart: () => void
}) {
  const correct = results.filter((r) => r.correct).length
  const pct = Math.round((correct / results.length) * 100)
  const passed = pct >= 70

  return (
    <div className="flex flex-col items-center px-4 py-8 gap-6">
      <div
        className={`w-24 h-24 rounded-full flex items-center justify-center text-2xl font-bold ${
          passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
        }`}
      >
        {pct}%
      </div>
      <div className="text-center">
        <h2 className={`text-xl font-semibold ${passed ? 'text-green-700' : 'text-red-600'}`}>
          {passed ? '🎉 Passed!' : 'Keep Practicing'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {correct} / {results.length} correct
        </p>
      </div>

      <div className="w-full max-w-md space-y-2">
        {results.map((r, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm border ${
              r.correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}
          >
            <span className="text-base">{r.correct ? '✅' : '❌'}</span>
            <div>
              <p className="font-medium text-gray-800">{questions[i]?.text}</p>
              {!r.correct && r.selectedOption === null && (
                <p className="text-xs text-amber-600 mt-0.5">No answer (timed out)</p>
              )}
              {!r.correct && r.selectedOption !== null && (
                <p className="text-xs text-red-600 mt-0.5">
                  Your answer: {questions[i]?.options[r.selectedOption]}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-0.5">
                Correct: {questions[i]?.options[questions[i]?.answer]}
              </p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onRestart}
        className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg py-2.5 px-8 text-sm transition-colors"
      >
        Start New Session
      </button>
    </div>
  )
}

// ── Main CertificationPage ────────────────────────────────────────────────────

export default function CertificationPage() {
  const [allQuestions, setAllQuestions] = useState<Question[]>([])
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loadingData, setLoadingData] = useState(true)

  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([])
  const [results, setResults] = useState<SessionResult[]>([])
  const [currentIdx, setCurrentIdx] = useState(-1)     // -1 = setup, -2 = summary
  const [explanationsOn, setExplanationsOn] = useState(true)
  const [timerEnabled, setTimerEnabled] = useState(true)

  useEffect(() => {
    Promise.all([fetchQuestions(), fetchConfig()]).then(([qs, cfg]) => {
      setAllQuestions(qs)
      setConfig(cfg)
      setLoadingData(false)
    })
  }, [])

  const handleStart = (count: number, explanations: boolean, timer: boolean) => {
    const selected = shuffle(allQuestions).slice(0, count)
    setSessionQuestions(selected)
    setResults([])
    setCurrentIdx(0)
    setExplanationsOn(explanations)
    setTimerEnabled(timer)
  }

  const handleAnswer = (optionIdx: number | null, timeTaken: number) => {
    const q = sessionQuestions[currentIdx]
    const correct = optionIdx === q.answer
    // Update or insert result at currentIdx (supports Back navigation re-answers)
    setResults((prev) => {
      const updated = [...prev]
      updated[currentIdx] = { questionId: q.id, selectedOption: optionIdx, correct, timeTaken }
      return updated
    })

    // Timer mode: auto-advance after a short delay
    if (timerEnabled) {
      setTimeout(() => {
        if (currentIdx + 1 < sessionQuestions.length) {
          setCurrentIdx((i) => i + 1)
        } else {
          setCurrentIdx(-2)
        }
      }, explanationsOn ? 2200 : 800)
    }
    // No-timer mode: user clicks Next manually
  }

  const handleNext = () => {
    if (currentIdx + 1 < sessionQuestions.length) {
      setCurrentIdx((i) => i + 1)
    } else {
      setCurrentIdx(-2)
    }
  }

  const handleBack = () => {
    if (currentIdx > 0) setCurrentIdx((i) => i - 1)
  }

  const handleDisable = async () => {
    const q = sessionQuestions[currentIdx]
    await updateQuestion(q.id, { disabled: true })
    // Remove from the local session list so it doesn't appear if user goes Back
    setSessionQuestions((prev) => prev.filter((_, i) => i !== currentIdx))
    setResults((prev) => prev.filter((_, i) => i !== currentIdx))
    // Stay on same index (now points to the next question) or go to summary
    setCurrentIdx((idx) => {
      const newLen = sessionQuestions.length - 1
      if (newLen === 0) return -2
      return Math.min(idx, newLen - 1)
    })
  }

  if (loadingData) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        Loading questions…
      </div>
    )
  }

  if (currentIdx === -2) {
    return (
      <SummaryScreen
        results={results}
        questions={sessionQuestions}
        onRestart={() => setCurrentIdx(-1)}
      />
    )
  }

  if (currentIdx === -1) {
    return (
      <SetupScreen
        totalAvailable={allQuestions.length}
        defaultCount={config?.defaultQuestionCount ?? 10}
        onStart={handleStart}
      />
    )
  }

  return (
    <div className="pb-8">
      {/* In-session toggles */}
      <div className="flex items-center justify-end gap-4 mb-4 px-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Explanations</span>
          <button
            onClick={() => setExplanationsOn((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              explanationsOn ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                explanationsOn ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Timer</span>
          <button
            onClick={() => setTimerEnabled((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              timerEnabled ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                timerEnabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      <QuestionCard
        key={currentIdx}
        question={sessionQuestions[currentIdx]}
        index={currentIdx}
        total={sessionQuestions.length}
        explanationsOn={explanationsOn}
        timerEnabled={timerEnabled}
        existingResult={results[currentIdx]}
        onAnswer={handleAnswer}
        onNext={handleNext}
        onBack={handleBack}
        onDisable={handleDisable}
      />
    </div>
  )
}
