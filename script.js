/* Updated script.js — small UX improvements: login modal focus and forgot-password sent to coordination email when configured. */

import { firebaseReady, auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, where, onSnapshot, runTransaction, writeBatch, serverTimestamp, Timestamp, increment } from './firebase.js'
import * as XLSX from 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm'

const config = {
  organizationName: 'Libris',
  currentSchoolId: 'escola-padrao',
  schoolName: 'Biblioteca escolar',
  coordinationEmail: '',
  reminderDays: 1,
  coordinationDays: 7,
  maxBooksStudent: 2,
  maxBooksTeacher: 35,
  teacherLoanDays: 21,
  emailjs: {
    serviceId: 'service_kj4o9me',
    studentTemplateId: 'template_7jhtc1d',
    coordinationTemplateId: 'template_05hf89g',
    publicKey: '3NnWny8jJqnZwiFWU'
  }
}

const defaultCategories = []
const categories = [{ id: 'all', name: 'Todas' }, ...defaultCategories]
const fallbackBooks = []
const fallbackReaders = []
const fallbackLoans = []
const canUseFirebase = Boolean(firebaseReady && auth && db)

const state = {
  user: null,
  profile: null,
  books: [],
  readers: [],
  loans: [],
  csv: [],
  categories: [...defaultCategories],
  acervoQuery: '',
  readerQuery: '',
  adminUnsubs: [],
  loanFilter: 'all'
}

let pendingCsvImport = null

const $ = (s) => (typeof document !== 'undefined' ? document?.querySelector?.(s) ?? null : null)
const $$ = (s) => (typeof document !== 'undefined' ? Array.from(document?.querySelectorAll?.(s) || []) : [])
const esc = (v = '') => String(v).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c])
const getCategoryOptions = () => (state.categories.length ? state.categories : defaultCategories)
const label = (id) => getCategoryOptions().find((x) => x.id === id)?.name || categories.find((x) => x.id === id)?.name || 'Geral'
const available = (b) => Number(b.available || 0) > 0
const bookStatus = (b) => available(b) ? 'disponivel' : 'emprestado'
const date = (v) => v?.toDate ? v.toDate() : v ? new Date(v) : null
const formatDate = (v) => date(v)?.toLocaleDateString('pt-BR') || '—'
const overdue = (l) => l.status === 'active' && date(l.dueAt) < new Date()

function toast(message, type = 'success') { const el = $('#toast'); if (!el) return; el.textContent = message; el.className = `toast ${type}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.className = 'toast hidden' }, 4000) }
function error(err, message = 'Não foi possível conectar ao servidor. Verifique sua conexão.') { console.error(err); toast(err?.code === 'auth/invalid-credential' ? 'E-mail ou senha inválidos.' : message, 'error') }
function loading(button, value, text = 'Aguarde…') { if (!button) return; button.disabled = value; if (value) { button.dataset.text = button.textContent; button.textContent = text } else button.textContent = button.dataset.text || button.textContent }

function modal(id, open) {
  const el = typeof document !== 'undefined' ? document.getElementById(id) : null
  if (el) {
    if (!open) {
      const activeElement = el.querySelector(':focus')
      if (activeElement) activeElement.blur()
    }
    el.classList.toggle('hidden', !open)
    el.setAttribute('aria-hidden', String(!open))
  }
}

/* keep the rest of helpers/renderers unchanged... (omitted in this patch) */

// ... (the code between here and the UI handlers remains the same as previously committed)

// SETUP / UI handlers (important parts shown and updated)

setup(); syncSchoolSettingsForm()
if ($('#importCsvBtn')) $('#importCsvBtn').onclick = () => modal('importCsvFileModal', true)
if ($('#importCsvInput')) $('#importCsvInput').onchange = importCsv
const cancelCsvFileSelection = () => { if ($('#importCsvInput')) $('#importCsvInput').value = ''; modal('importCsvFileModal', false) }
if ($('#cancelCsvFileBtn')) $('#cancelCsvFileBtn').onclick = cancelCsvFileSelection
if ($('#closeCsvFileModalBtn')) $('#closeCsvFileModalBtn').onclick = cancelCsvFileSelection
const cancelCsvImport = () => { pendingCsvImport = null; modal('importCsvConfirmModal', false) }
if ($('#cancelCsvImportBtn')) $('#cancelCsvImportBtn').onclick = cancelCsvImport
if ($('#closeCsvImportBtn')) $('#closeCsvImportBtn').onclick = cancelCsvImport
if ($('#confirmCsvImportBtn')) $('#confirmCsvImportBtn').onclick = confirmCsvImport

if ($('#loginForm')) {
  $('#loginForm').onsubmit = async (x) => {
    x.preventDefault();
    const email = $('#loginForm input[type="email"]')?.value.trim();
    const password = $('#loginForm input[type="password"]')?.value;
    const b = $('#loginForm button[type="submit"]');
    loading(b, true, 'Entrando…');

    if (!canUseFirebase || !auth) {
      toast('Firebase Auth indisponível. Verifique a configuração do projeto.', 'error'); loading(b, false); return
    }

    try {
      await signInWithEmailAndPassword(auth, email, password)
      modal('loginModal', false)
    } catch (err) { error(err) } finally { loading(b, false) }

  }
}

// Reset password: prefer coordination email if configured, otherwise fallback to input
if ($('#resetPasswordBtn')) {
  $('#resetPasswordBtn').onclick = async () => {
    const coordEmail = (config.coordinationEmail || $('#coordinationEmailInput')?.value || '').trim()
    const inputEmail = $('#loginForm input[type="email"]')?.value.trim()
    const emailToSend = coordEmail || inputEmail
    if (!emailToSend) return toast('Nenhum e-mail disponível para recuperação. Contate a coordenação.', 'error')
    if (!canUseFirebase || !auth) return toast('A recuperação de senha local não está ativa.', 'error')
    try {
      await sendPasswordResetEmail(auth, emailToSend)
      toast(`Link de recuperação enviado para ${emailToSend}.`)
    } catch (err) { error(err, 'Não foi possível enviar a recuperação.') }
  }
}

if ($('#resetPasswordBtn')) $('#resetPasswordBtn').title = 'Enviar link de recuperação para o e-mail da coordenação (se configurado)'

// Ensure modal focus when opening login modal in common places
const focusLoginEmail = () => setTimeout(() => { $('#loginForm input[type="email"]')?.focus() }, 150)

// Small init wrapper to ensure modal opened for unauthenticated users gains focus
async function init() {
  updateReaderFields(); renderCategorySelect(); renderCategoryList(); renderBooks(); renderReaders(); renderLoans(); renderDashboard();

  if (!canUseFirebase || !db) {
    hydrateFallbackData(); state.user = null; $('#logoutBtn')?.classList?.add('hidden'); modal('loginModal', true); focusLoginEmail(); return
  }

  try {
    await ensureCurrentSchoolId(); renderCategorySelect(); renderCategoryList(); renderBooks(); renderReaders(); renderLoans(); renderDashboard();
    const school = await getDoc(doc(db, 'schools', config.currentSchoolId))
    if (school.exists()) {
      const data = school.data(); if (data.name) config.schoolName = data.name
      config.coordinationEmail = data.coordinationEmail || ''
      config.reminderDays = Number(data.reminderDays ?? 1)
      config.coordinationDays = Number(data.coordinationDays ?? 7)
      config.maxBooksStudent = Number(data.maxBooksStudent ?? 2)
      config.maxBooksTeacher = Number(data.maxBooksTeacher ?? 35)
      config.teacherLoanDays = Number(data.teacherLoanDays ?? 21)
      syncSchoolSettingsForm()
    }
    if ($('#schoolName')) $('#schoolName').textContent = config.schoolName
  } catch (err) { error(err) }

  onAuthStateChanged(auth, async (user) => {
    state.user = user
    if ($('#logoutBtn')) $('#logoutBtn').classList.toggle('hidden', !user)

    if (!user) {
      try { clearAdminSubscriptions() } catch (e) { console.warn('Erro ao limpar subscriptions no onAuthStateChanged(null):', e) }
      state.profile = null; state.books = []; state.readers = []; state.loans = []; state.categories = []
      renderReaders(); renderLoans(); renderBooks(); renderCategoryList(); renderDashboard();
      modal('loginModal', true)
      focusLoginEmail()
      return
    }

    const schoolBeforeProfile = config.currentSchoolId
    state.profile = await resolveUserSchool(user)
    if (state.profile?.role !== 'admin') {
      try { clearAdminSubscriptions() } catch (e) { console.warn('Erro ao limpar subscriptions (não admin):', e) }
      state.profile = null; state.user = null
      toast('Esta conta não possui acesso administrativo.', 'error')
      try { await signOut(auth) } catch (e) { /* ignore */ }
      return
    }

    subscribeAdmin()
  })
}

init()

// Update logout handler to focus login modal when signing out locally
if ($('#logoutBtn')) {
  $('#logoutBtn').onclick = async () => {
    try { clearAdminSubscriptions() } catch (e) { console.warn('clearAdminSubscriptions failed before signOut:', e) }
    if (!canUseFirebase || !auth) {
      state.user = null; $('#logoutBtn')?.classList?.add('hidden'); modal('loginModal', true); focusLoginEmail(); toast('Sessão local encerrada.'); return
    }
    try { await signOut(auth); /* onAuthStateChanged will open modal and focus */ toast('Sessão encerrada.') } catch (err) { error(err) }
  }
}
