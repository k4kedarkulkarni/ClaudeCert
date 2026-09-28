# Claude Architect Certification App

A mobile-friendly certification practice app for the Claude Architect exam.

## Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS v4
- **Backend**: Firebase (Firestore, Auth, Storage)
- **Deployment**: Netlify

---

## Setup

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com) → New project
2. Enable **Firestore Database** (start in production mode)
3. Enable **Authentication** → Email/Password provider
4. Enable **Storage**
5. Create an admin user: Authentication → Users → Add user

### 2. Firebase Rules
Deploy the included rules files:
```bash
npm install -g firebase-tools
firebase login
firebase init   # select Firestore + Storage, use existing project
firebase deploy --only firestore:rules,storage
```

Or paste [`firestore.rules`](./firestore.rules) and [`storage.rules`](./storage.rules) directly in the Firebase Console.

### 3. Environment Variables
Copy `.env.example` to `.env.local` and fill in your Firebase config values:
```bash
cp .env.example .env.local
```
Find your config: Firebase Console → Project Settings → Your apps → Firebase SDK snippet → Config.

### 4. Local Development
```bash
npm install
npm run dev
```

### 5. Deploy to Netlify
1. Push the `claude-cert-app` folder to a GitHub repo
2. In Netlify: **Add new site → Import from Git**
3. Build command: `npm run build` | Publish directory: `dist`
4. Add all `VITE_FIREBASE_*` variables under **Site settings → Environment variables**
5. Deploy

---

## Usage

### Admin (`/admin`)
Log in at `/admin/login` with your Firebase Auth credentials.

- **Questions tab**: Add, edit, delete questions manually
- **Settings tab**: Configure 2 LLMs (Anthropic / OpenAI), set default question count, upload instructor PDF
- **AI Generate tab**: Use a configured LLM to bulk-generate questions and add them to the bank

### Public (`/`)
- **Certification tab**: Choose number of questions, toggle explanations, start timed session (60s/question)
- **Instructor Guide tab**: View the PDF uploaded by admin

---

## Architecture

```
src/
├── context/AuthContext.tsx   # Firebase Auth state
├── firebase.ts               # Firebase init
├── firestore.ts              # Firestore + Storage helpers
├── llm.ts                    # OpenAI / Anthropic API calls
├── types.ts                  # Shared TypeScript types
└── pages/
    ├── HomePage.tsx           # Tab shell (Cert + Guide)
    ├── CertificationPage.tsx  # Quiz engine with timer
    ├── InstructorGuidePage.tsx# PDF viewer
    ├── AdminPage.tsx          # Full admin panel
    └── LoginPage.tsx          # Admin login
```

## Firestore Schema

```
/questions/{id}
  text: string
  options: string[4]
  answer: number        // 0-based index
  explanation: string
  topic: string
  createdAt: number

/config/main
  llm1: { provider, apiKey, model }
  llm2: { provider, apiKey, model }
  defaultQuestionCount: number
  instructorPdfUrl: string
```
