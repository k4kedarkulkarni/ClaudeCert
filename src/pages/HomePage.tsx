import { useState } from 'react'
import { Link } from 'react-router-dom'
import InstructorGuidePage from './InstructorGuidePage'
import CertificationPage from './CertificationPage'
import ChatBotPage from './ChatBotPage'

type Tab = 'cert' | 'chat' | 'guide'

export default function HomePage() {
  const [tab, setTab] = useState<Tab>('cert')

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 leading-tight">
                Claude Architect
              </h1>
              <p className="text-xs text-gray-400">Certification Practice</p>
            </div>
            <Link
              to="/admin/login"
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Admin
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex">
            {([
              { id: 'cert',  label: '📋 Certification' },
              { id: 'chat',  label: '🤖 AI Assistant' },
              { id: 'guide', label: '📖 Instructor Guide' },
            ] as { id: Tab; label: string }[]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 text-xs sm:text-sm py-2.5 border-b-2 transition-colors font-medium whitespace-nowrap ${
                  tab === t.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Tab content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">
        {tab === 'cert'  && <CertificationPage />}
        {tab === 'chat'  && <ChatBotPage />}
        {tab === 'guide' && <InstructorGuidePage />}
      </main>
    </div>
  )
}
