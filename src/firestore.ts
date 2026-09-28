import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  orderBy,
  query,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from './firebase'
import type { Question, AppConfig } from './types'

// ── Questions ────────────────────────────────────────────────────────────────

// Fetches only active (non-disabled) questions — used by the certification page
export async function fetchQuestions(): Promise<Question[]> {
  const q = query(collection(db, 'questions'), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Question))
    .filter((q) => !q.disabled)
}

// Fetches all questions including disabled ones — used by admin
export async function fetchAllQuestions(): Promise<Question[]> {
  const q = query(collection(db, 'questions'), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Question))
}

export async function addQuestion(q: Omit<Question, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'questions'), q)
  return ref.id
}

export async function updateQuestion(id: string, data: Partial<Omit<Question, 'id'>>): Promise<void> {
  await updateDoc(doc(db, 'questions', id), data)
}

export async function deleteQuestion(id: string): Promise<void> {
  await deleteDoc(doc(db, 'questions', id))
}

// ── App Config ───────────────────────────────────────────────────────────────

const CONFIG_DOC = 'main'

export async function fetchConfig(): Promise<AppConfig | null> {
  const snap = await getDoc(doc(db, 'config', CONFIG_DOC))
  if (!snap.exists()) return null
  return snap.data() as AppConfig
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await setDoc(doc(db, 'config', CONFIG_DOC), config)
}

// ── PDF Upload ───────────────────────────────────────────────────────────────

export async function uploadInstructorPdf(file: File): Promise<string> {
  const storageRef = ref(storage, 'instructor/guide.pdf')
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}
