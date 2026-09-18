import { firebaseReady, auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, fetchSignInMethodsForEmail, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, where, onSnapshot, runTransaction, serverTimestamp, Timestamp } from './firebase.js'
import * as XLSX from 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm'

const config = { organizationName: 'Libris', currentSchoolId: 'escola-padrao', schoolName: 'Biblioteca escolar', emailjs: { serviceId: 'service_vpiw60w', templateId: 'template_s1sr3xs', publicKey: 'FS9fOYvVSD-vMtAWs' } }
const demoAdmin = { email: 'admin@teste.com', password: '123456' }
const defaultCategories = [ ]
const categories = [{ id: 'all', name: 'Todas' }, ...defaultCategories]
const fallbackBooks = [
  { id: 'demo-1', code: '01-0042', title: 'Dom Casmurro', author: 'Machado de Assis', categoryId: '01', available: 2, total: 3, year: 1899, shelf: 'Estante 2 · Prateleira B', synopsis: 'Clássico da literatura brasileira.', status: 'disponivel' },
  { id: 'demo-2', code: '03-0007', title: 'Cálculo Volume 1', author: 'James Stewart', categoryId: '03', available: 1, total: 4, year: 2016, shelf: 'Estante 4 · Prateleira A', synopsis: 'Livro de matemática para apoio escolar.', status: 'disponivel' },
  { id: 'demo-3', code: '05-0088', title: 'Biologia das Plantas', author: 'Raven & Evert', categoryId: '05', available: 0, total: 2, year: 2014, shelf: 'Estante 5 · Prateleira B', synopsis: 'Material de ciências e agronegócio.', status: 'emprestado' }
]
const fallbackReaders = [
  { id: 'demo-r1', name: 'Maria Rocha', type: 'Aluno', course: 'Informática · 2026', matricula: '2026001', cpf: '', email: 'maria@escola.edu.br', phone: '(88) 99999-1010' },
  { id: 'demo-r2', name: 'João Souza', type: 'Professor', course: 'Ensino Médio', matricula: '', cpf: '123.456.789-00', email: 'joao@escola.edu.br', phone: '(88) 98888-2020' }
]
const fallbackLoans = [
  { id: 'demo-l1', bookId: 'demo-3', bookCode: '05-0088', bookTitle: 'Biologia das Plantas', readerId: 'demo-r1', readerName: 'Maria Rocha', readerCourse: 'Informática · 2026', days: 7, dueAt: new Date(Date.now() + 86400000 * 3), status: 'active' }
]
const canUseFirebase = Boolean(firebaseReady && auth && db)
const state = { user: null, books: [], readers: [], loans: [], csv: [], categories: [...defaultCategories], category: 'all', status: 'all', query: '', acervoQuery: '', readerQuery: '', unsubs: [] }

async function loadSchoolData(schoolId = config.currentSchoolId) {
  if (!canUseFirebase || !db) return

  try {
    config.currentSchoolId = schoolId || config.currentSchoolId
    const school = await getDoc(doc(db, 'schools', config.currentSchoolId))
    if (school.exists() && school.data().name) {
      config.schoolName = school.data().name
    }
    const schoolNameNode = $('#schoolName')
    if (schoolNameNode) schoolNameNode.textContent = config.schoolName
  } catch (err) {
    error(err, 'Não foi possível carregar a escola vinculada ao login.')
  }
}

async function resolveUserSchool(user) {
  if (!canUseFirebase || !db || !user) {
    await ensureCurrentSchoolId()
    const schoolNameNode = $('#schoolName')
    if (schoolNameNode) schoolNameNode.textContent = config.schoolName
    return
  }

  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid))
    const schoolId = userDoc.exists() && userDoc.data().schoolId ? userDoc.data().schoolId : config.currentSchoolId
    await loadSchoolData(schoolId)
    await ensureCurrentSchoolId()
  } catch (err) {
    error(err, 'Não foi possível recuperar a escola deste usuário.')
  }
}

async function ensureCurrentSchoolId() {
  if (!canUseFirebase || !db) return

  try {
    const schoolDoc = await getDoc(doc(db, 'schools', config.currentSchoolId))
    if (schoolDoc.exists()) {
      if (schoolDoc.data().name) config.schoolName = schoolDoc.data().name
      return
    }

    const schoolsSnap = await getDocs(collection(db, 'schools'))
    if (!schoolsSnap.empty) {
      const firstSchool = schoolsSnap.docs[0]
      const firstSchoolId = firstSchool.id || firstSchool.data().id || config.currentSchoolId
      config.currentSchoolId = firstSchoolId
      if (firstSchool.data().name) config.schoolName = firstSchool.data().name
    } else {
      config.currentSchoolId = 'escola-padrao'
      config.schoolName = 'Biblioteca escolar'
    }
  } catch (err) {
    config.currentSchoolId = 'escola-padrao'
    config.schoolName = 'Biblioteca escolar'
  }
}
const $ = (s) => document.querySelector(s)
const $$ = (s) => [...document.querySelectorAll(s)]
const e = { grid: $('#bookGrid'), results: $('#resultsMeta'), categories: $('#categoryFilters'), books: $('#bookTableBody'), readers: $('#readersTableBody'), loans: $('#loansTableBody'), kpis: $('#kpiGrid'), genre: $('#genreChart'), course: $('#courseChart'), topReaders: $('#readerChart'), donut: $('#statusDonut'), legend: $('#statusLegend'), toast: $('#toast') }
const esc = (v = '') => String(v).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c])
const getCategoryOptions = () => (state.categories.length ? state.categories : defaultCategories)
const label = (id) => getCategoryOptions().find((x) => x.id === id)?.name || categories.find((x) => x.id === id)?.name || 'Geral'
const available = (b) => Number(b.available || 0) > 0

async function lookupBookMetadata(title, author, publisher) {
  const query = [title, author, publisher].filter(Boolean).join(' ')
  if (!query) return { synopsis: '', coverUrl: '' }

  try {
    const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&publisher=${encodeURIComponent(publisher || '')}&limit=1`
    const response = await fetch(url)
    if (!response.ok) return { synopsis: '', coverUrl: '' }
    const data = await response.json()
    const doc = data.docs?.[0]
    if (!doc) return { synopsis: '', coverUrl: '' }

    let synopsis = ''
    if (Array.isArray(doc.subtitle) && doc.subtitle.length) {
      synopsis = doc.subtitle.join('. ')
    }
    if (!synopsis && doc.first_sentence) {
      synopsis = Array.isArray(doc.first_sentence) ? doc.first_sentence.join(' ') : String(doc.first_sentence)
    }
    if (!synopsis && doc.author_name) {
      synopsis = `Livro de ${doc.author_name[0]} publicado por ${publisher || 'editora não informada'}.`
    }

    const coverId = doc.cover_i || doc.covers?.[0]
    const coverUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : ''
    return { synopsis: synopsis.slice(0, 500), coverUrl }
  } catch (error) {
    console.warn('Não foi possível buscar dados do livro na Open Library:', error)
    return { synopsis: '', coverUrl: '' }
  }
}
const bookStatus = (b) => available(b) ? 'disponivel' : 'emprestado'
const date = (v) => v?.toDate ? v.toDate() : v ? new Date(v) : null
const formatDate = (v) => date(v)?.toLocaleDateString('pt-BR') || '—'
const overdue = (l) => l.status === 'active' && date(l.dueAt) < new Date()

function toast(message, type = 'success') { e.toast.textContent = message; e.toast.className = `toast ${type}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => { e.toast.className = 'toast hidden' }, 4000) }
function error(err, message = 'Não foi possível conectar ao servidor. Verifique sua conexão.') { console.error(err); toast(err?.code === 'auth/invalid-credential' ? 'E-mail ou senha inválidos.' : message, 'error') }
function loading(button, value, text = 'Aguarde…') { button.disabled = value; if (value) { button.dataset.text = button.textContent; button.textContent = text } else button.textContent = button.dataset.text || button.textContent }
function modal(id, open) { const el = document.getElementById(id); el.classList.toggle('hidden', !open); el.setAttribute('aria-hidden', String(!open)) }
function count(list, key) { const map = new Map(); list.forEach((x) => { const k = key(x); map.set(k, (map.get(k) || 0) + 1) }); return [...map].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) }

function renderCategories() {
  const options = [{ id: 'all', name: 'Todas' }, ...getCategoryOptions()]
  e.categories.innerHTML = options.map((c) => `<button type="button" class="category-chip ${state.category === c.id ? 'is-active' : ''}" data-category="${c.id}">${c.name}</button>`).join('')
  $$('[data-category]').forEach((b) => b.onclick = () => { state.category = b.dataset.category; renderCategories(); renderPublicBooks() })
}
function renderCategorySelect() {
  const select = $('#bookCategoryInput')
  if (!select) return
  select.innerHTML = getCategoryOptions().map((c) => `<option value="${c.id}">${c.name}</option>`).join('')
}
function renderCategoryList() {
  const list = $('#categoryList')
  if (!list) return
  list.innerHTML = getCategoryOptions().length ? getCategoryOptions().map((c) => `<div class="category-item"><span>${esc(c.name)}</span><small>${esc(c.code || c.id)}</small><button type="button" class="small-btn danger" data-del-category="${c.id}">Apagar</button></div>`).join('') : '<p class="empty-state">Nenhuma categoria cadastrada.</p>'
  $$('[data-del-category]').forEach((b) => b.onclick = () => removeCategory(b.dataset.delCategory))
}
function filteredBooks() { const q = state.query.toLowerCase().trim(); return state.books.filter((b) => (!q || [b.title, b.author, b.code, label(b.categoryId)].some((v) => String(v || '').toLowerCase().includes(q))) && (state.category === 'all' || b.categoryId === state.category) && (state.status === 'all' || bookStatus(b) === state.status)) }
function renderPublicBooks() { const list = filteredBooks(); e.results.textContent = `${list.length} ${list.length === 1 ? 'resultado' : 'resultados'}`; e.grid.innerHTML = list.length ? list.map((b) => `<button class="book-card" type="button" data-book="${b.id}"><div class="book-cover ${b.coverUrl ? 'has-cover' : ''}">${b.coverUrl ? `<img class="book-cover-art" src="${b.coverUrl}" alt="Capa de ${esc(b.title)}">` : `<div class="book-cover-top"><span>${esc(b.categoryId)}</span><span>${esc(b.year || '—')}</span></div><div><div class="book-cover-title">${esc(b.title)}</div><div class="book-cover-author">${esc(b.author)}</div></div>`}</div><div class="book-card-meta"><div class="book-code-row"><span class="book-code">${esc(b.code)}</span><span class="badge ${bookStatus(b) === 'disponivel' ? 'available' : 'borrowed'}">${bookStatus(b) === 'disponivel' ? 'Disponível' : 'Emprestado'}</span></div><div class="book-card-title">${esc(b.title)}</div><div class="book-card-author">${esc(b.author)}</div><div class="book-card-category">${esc(b.categoryId)} · ${esc(label(b.categoryId))}</div><div class="book-card-location">📍 ${esc(b.shelf || 'Não informada')}</div></div></button>`).join('') : '<div class="panel empty-state">Nenhum livro encontrado.</div>'; $$('[data-book]').forEach((b) => b.onclick = () => showBook(state.books.find((x) => x.id === b.dataset.book))) }
function showBook(b) { if (!b) return; $('#bookModalContent').innerHTML = `<div class="book-modal-cover">${b.coverUrl ? `<img class="book-cover-art modal-cover-art" src="${b.coverUrl}" alt="Capa de ${esc(b.title)}">` : `<div class="book-cover"><div class="book-cover-top"><span>${esc(b.categoryId)}</span><span>${esc(b.year || '—')}</span></div><div><div class="book-cover-title">${esc(b.title)}</div><div class="book-cover-author">${esc(b.author)}</div></div></div>`}</div><div class="book-details"><span class="eyebrow">${esc(label(b.categoryId))}</span><h3>${esc(b.title)}</h3><p>${esc(b.author)} · ${esc(b.year || 'Ano não informado')}</p><div class="book-meta-grid"><div class="meta-box"><div class="meta-label">ID</div><div class="meta-value">${esc(b.code)}</div></div><div class="meta-box"><div class="meta-label">Disponibilidade</div><div class="meta-value">${Number(b.available || 0)} de ${Number(b.total || 0)}</div></div><div class="meta-box"><div class="meta-label">Editora</div><div class="meta-value">${esc(b.publisher || 'Não informada')}</div></div><div class="meta-box"><div class="meta-label">Localização</div><div class="meta-value">${esc(b.shelf || 'Não informada')}</div></div></div><p>${esc(b.synopsis || 'Sinopse não informada.')}</p><div class="qr-box"><div class="qr-shape" aria-hidden="true"></div><small>QR Code público do livro<br><strong>${esc(b.code)}</strong></small></div></div>`; modal('bookModal', true) }
function renderBars(target, data) { if (!data.length) { target.innerHTML = '<p class="empty-state">Sem dados.</p>'; return }; const max = Math.max(...data.map((x) => x.value), 1); target.innerHTML = data.map((x) => `<div class="bar-row"><span>${esc(x.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${x.value / max * 100}%"></div></div><strong>${x.value}</strong></div>`).join('') }
function renderDashboard() { const active = state.loans.filter((l) => l.status === 'active'); const values = [['Total de Livros', state.books.reduce((n, b) => n + Number(b.total || 0), 0), '📚'], ['Empréstimos Ativos', active.length, '📖'], ['Livros em Atraso', active.filter(overdue).length, '⚠️'], ['Leitores Cadastrados', state.readers.length, '👥']]; e.kpis.innerHTML = values.map(([name, value, icon]) => `<div class="kpi-card"><div class="kpi-card-head"><span>${name}</span><span class="kpi-icon">${icon}</span></div><div class="kpi-value">${value}</div></div>`).join(''); renderBars(e.genre, getCategoryOptions().map((c) => ({ label: c.name, value: state.books.filter((b) => b.categoryId === c.id).length })).filter((x) => x.value).sort((a, b) => b.value - a.value).slice(0, 5)); const total = state.books.reduce((n, b) => n + Number(b.total || 0), 0), free = state.books.reduce((n, b) => n + Number(b.available || 0), 0), percent = total ? Math.round(free / total * 100) : 0; e.donut.innerHTML = `<div class="donut" style="background:conic-gradient(var(--success) 0 ${percent}%,var(--warning) ${percent}% 100%)"><div class="donut-center">${percent}%</div></div>`; e.legend.innerHTML = `<div class="legend-item"><span class="legend-dot success"></span>Disponíveis: ${free}</div><div class="legend-item"><span class="legend-dot warning"></span>Emprestados: ${Math.max(0, total - free)}</div>`; renderBars(e.course, count(active, (l) => l.readerCourse || 'Não informado').slice(0, 5)); const top = count(state.loans, (l) => l.readerName || 'Leitor').slice(0, 5); e.topReaders.innerHTML = top.length ? top.map((x) => `<div class="list-item"><strong>${esc(x.label)}</strong><span>${x.value} empréstimos</span></div>`).join('') : '<p class="empty-state">Sem dados.</p>' }

function hydrateFallbackData() {
  state.categories = [...defaultCategories]
  state.books = fallbackBooks.map((book) => {
    const total = Number(book.total || 0)
    const available = Number(book.available ?? total)
    return { ...book, total, available, status: available > 0 ? 'disponivel' : 'emprestado' }
  })
  state.readers = fallbackReaders
  state.loans = fallbackLoans.map((loan) => ({ ...loan, dueAt: loan.dueAt instanceof Date ? loan.dueAt : new Date(loan.dueAt), status: loan.status || 'active' }))
  renderCategorySelect()
  renderCategoryList()
  renderPublicBooks()
  renderBooks()
  renderReaders()
  renderLoans()
  renderDashboard()
}
function renderLoans() {
  const list = state.loans.filter((l) => l.status === 'active')
  e.loans.innerHTML = list.length ? list.map((l) => {
    const selectedDays = Number(l.days || 7)
    const renewOptions = [7, 14, 21, 30].map((days) => `<option value="${days}" ${days === selectedDays ? 'selected' : ''}>${days} dias</option>`).join('')
    return `<tr><td>${esc(l.bookTitle)}<br><small>${esc(l.bookCode)}</small></td><td>${esc(l.readerName)}</td><td><div>${formatDate(l.dueAt)}</div><small>Prazo: ${selectedDays} dias</small></td><td><span class="badge ${overdue(l) ? 'borrowed' : 'available'}">${overdue(l) ? 'Em atraso' : 'Em dia'}</span></td><td><div class="action-row"><select class="renew-days" data-renew-days="${l.id}" aria-label="Dias para renovar">${renewOptions}</select><button class="small-btn primary" data-return="${l.id}" type="button">Devolver</button><button class="small-btn warning" data-renew="${l.id}" type="button">Renovar</button><button class="small-btn danger" data-notify="${l.id}" type="button">Notificar</button></div></td></tr>`
  }).join('') : '<tr><td colspan="5">Nenhum empréstimo ativo.</td></tr>'
  $$('[data-return]').forEach((b) => b.onclick = () => returnLoan(b.dataset.return)); $$('[data-renew]').forEach((b) => b.onclick = () => renewLoan(b.dataset.renew)); $$('[data-notify]').forEach((b) => b.onclick = () => notify(b.dataset.notify))
}
function renderBooks() { const q = state.acervoQuery.toLowerCase().trim(), list = state.books.filter((b) => !q || [b.title, b.author, b.code].some((x) => String(x || '').toLowerCase().includes(q))); e.books.innerHTML = list.length ? list.map((b) => `<tr><td>${esc(b.code)}</td><td>${esc(b.title)}</td><td>${esc(label(b.categoryId))}</td><td>${esc(b.tombamento || 'Não informado')}</td><td>${Number(b.total || 0)}</td><td>${esc(b.shelf || '—')}</td><td><span class="badge ${bookStatus(b) === 'disponivel' ? 'available' : 'borrowed'}">${bookStatus(b) === 'disponivel' ? 'Disponível' : 'Emprestado'}</span></td><td><button class="small-btn danger" type="button" data-del-book="${b.id}">Apagar</button></td></tr>`).join('') : '<tr><td colspan="8">Nenhum livro cadastrado.</td></tr>'; $$('[data-del-book]').forEach((b) => b.onclick = () => removeBook(b.dataset.delBook)) }
function renderReaderSelector() {
  const select = $('#readerSelectInput')
  if (!select) return
  const options = ['<option value="">Selecione um leitor</option>']
  state.readers.forEach((reader) => {
    const label = `${reader.name} · ${reader.type}${reader.type === 'Aluno' && reader.matricula ? ` · ${reader.matricula}` : ''}`
    options.push(`<option value="${reader.id}">${esc(label)}</option>`)
  })
  select.innerHTML = options.join('')
}
function renderReaders() { const q = state.readerQuery.toLowerCase().trim(), list = state.readers.filter((r) => !q || [r.name, r.type, r.matricula].some((x) => String(x || '').toLowerCase().includes(q))); e.readers.innerHTML = list.length ? list.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.type)}</td><td>${esc(r.course || 'Não se aplica')}</td><td>${esc(r.type === 'Aluno' ? r.matricula : r.cpf || 'Não informado')}</td><td>${esc(r.email || '—')}<br><small>${esc(r.phone || '')}</small></td><td><button class="small-btn danger" type="button" data-del-reader="${r.id}">Apagar</button></td></tr>`).join('') : '<tr><td colspan="6">Nenhum leitor cadastrado.</td></tr>'; $$('[data-del-reader]').forEach((b) => b.onclick = () => removeReader(b.dataset.delReader)); renderReaderSelector() }
function updateReaderFields() { const student = $('#readerTypeInput').value === 'Aluno'; [['#readerCourseField', student], ['#readerRegistrationField', student], ['#readerCpfField', !student]].forEach(([s, visible]) => { const f = $(s); f.hidden = !visible; f.classList.toggle('hidden', !visible) }); $('#readerCourseInput').required = student; $('#readerRegistrationInput').required = student; $('#readerCpfInput').required = !student }
function tab(name) { $$('.tab-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name)); $$('.tab-panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === name)) }
function openForm(name, panel, input) { tab(name); $(panel).classList.remove('hidden'); $(input).focus(); $(panel).scrollIntoView({ behavior: 'smooth', block: 'start' }) }

async function addBook(event) {
  event.preventDefault()
  const button = $('#bookForm button[type="submit"]')
  const categoryId = $('#bookCategoryInput').value
  const selectedCategory = getCategoryOptions().find((c) => c.id === categoryId)
  const title = $('#bookTitleInput').value.trim()
  const author = $('#bookAuthorInput').value.trim()
  const publisher = $('#bookPublisherInput').value.trim()
  const existingMeta = await lookupBookMetadata(title, author, publisher)
  const book = {
    title,
    author,
    publisher,
    categoryId,
    year: Number($('#bookYearInput').value),
    shelf: $('#bookShelfInput').value.trim(),
    total: Number($('#bookQuantityInput').value),
    tombamento: $('#bookTombamentoInput').value.trim(),
    synopsis: existingMeta.synopsis,
    coverUrl: existingMeta.coverUrl
  }
  if (!book.title || !book.author || !Number.isInteger(book.total) || book.total < 1 || !selectedCategory) return toast('Preencha título, autor, categoria e quantidade válida.', 'error')
  loading(button, true, 'Salvando…')
  try {
    const schoolRef = doc(db, 'schools', config.currentSchoolId)
    const schoolSnap = await getDoc(schoolRef)
    const existingBooksSnap = await getDocs(query(collection(db, 'books'), where('schoolId', '==', config.currentSchoolId)))

    const savedSequence = Number(schoolSnap.exists() ? schoolSnap.data().bookSequences?.[book.categoryId] || 0 : 0)
    const existingSequence = existingBooksSnap.docs
      .filter((item) => item.data().categoryId === book.categoryId)
      .map((item) => Number(String(item.data().code || '').split('-')[1]))
      .filter(Number.isFinite)
      .reduce((max, number) => Math.max(max, number), 0)

    const next = Math.max(savedSequence, existingSequence) + 1
    const code = `${selectedCategory.code || selectedCategory.id}-${String(next).padStart(4, '0')}`

    await runTransaction(db, async (tx) => {
      const schoolTx = await tx.get(schoolRef)
      const schoolData = schoolTx.exists() ? schoolTx.data() : {}
      const currentSequences = schoolData.bookSequences || {}

      tx.set(schoolRef, {
        name: config.schoolName,
        active: true,
        bookSequences: { ...currentSequences, [book.categoryId]: next },
        updatedAt: serverTimestamp()
      }, { merge: true })

      tx.set(doc(collection(db, 'books')), {
        ...book,
        code,
        categoryName: selectedCategory.name,
        schoolId: config.currentSchoolId,
        available: book.total,
        status: 'disponivel',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    })

    $('#bookForm').reset(); renderCategorySelect(); $('#bookYearInput').value = new Date().getFullYear(); $('#bookQuantityInput').value = 1
    toast('Livro cadastrado com sucesso.')
  } catch (err) { error(err, 'Não foi possível salvar o livro.') } finally { loading(button, false) }
}
async function addCategory(event) {
  event.preventDefault()
  const button = $('#categoryForm button[type="submit"]')
  const name = $('#categoryNameInput').value.trim()
  const code = $('#categoryCodeInput').value.trim()
  if (!name || !code) return toast('Informe nome e código da categoria.', 'error')
  const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
  if (!normalizedCode) return toast('Código inválido para categoria.', 'error')
  if (getCategoryOptions().some((category) => category.name.toLowerCase() === name.toLowerCase() || category.code?.toLowerCase() === normalizedCode.toLowerCase())) return toast('Essa categoria já existe.', 'error')
  loading(button, true, 'Salvando…')
  try {
    const categoryRef = doc(db, 'categories', normalizedCode)
    await setDoc(categoryRef, { id: normalizedCode, name, code: normalizedCode, schoolId: config.currentSchoolId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true })
    $('#categoryForm').reset(); renderCategorySelect(); renderCategoryList(); toast('Categoria salva com sucesso.')
  } catch (err) { error(err, 'Não foi possível salvar a categoria.') } finally { loading(button, false) }
}
async function removeCategory(id) {
  if (!confirm('Apagar esta categoria?')) return
  try {
    await deleteDoc(doc(db, 'categories', id))
    toast('Categoria apagada.')
  } catch (err) { error(err, 'Não foi possível apagar a categoria.') }
}
async function addReader(event) { event.preventDefault(); const button = $('#readerForm button[type="submit"]'), type = $('#readerTypeInput').value, reader = { schoolId: config.currentSchoolId, name: $('#readerNameInput').value.trim(), type, course: type === 'Aluno' ? $('#readerCourseInput').value.trim() : '', matricula: type === 'Aluno' ? $('#readerRegistrationInput').value.trim() : '', cpf: type !== 'Aluno' ? $('#readerCpfInput').value.trim() : '', email: $('#readerEmailInput').value.trim(), phone: $('#readerPhoneInput').value.trim(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }; if (!reader.name || !reader.email || !reader.phone || (type === 'Aluno' && (!reader.course || !reader.matricula)) || (type !== 'Aluno' && !reader.cpf)) return toast('Preencha todos os campos obrigatórios.', 'error'); loading(button, true, 'Salvando…'); try { await addDoc(collection(db, 'readers'), reader); $('#readerForm').reset(); updateReaderFields(); toast('Leitor cadastrado com sucesso.') } catch (err) { error(err, 'Não foi possível salvar o leitor.') } finally { loading(button, false) } }
async function removeBook(id) { if (!confirm('Apagar este livro do acervo?')) return; try { await deleteDoc(doc(db, 'books', id)); toast('Livro apagado.') } catch (err) { error(err, 'Não foi possível apagar o livro.') } }
async function removeReader(id) { if (!confirm('Apagar este leitor?')) return; try { await deleteDoc(doc(db, 'readers', id)); toast('Leitor apagado.') } catch (err) { error(err, 'Não foi possível apagar o leitor.') } }
async function registerLoan() { const button = $('#registerLoanBtn'), code = $('#bookCodeInput').value.trim().toUpperCase(), text = $('#readerInput').value.trim(), selectedReaderId = $('#readerSelectInput').value, days = Number($('#loanDays').value), book = state.books.find((b) => b.code?.toUpperCase() === code), reader = selectedReaderId ? state.readers.find((r) => r.id === selectedReaderId) : state.readers.find((r) => r.matricula === text || r.name?.toLowerCase() === text.toLowerCase()); if (!book || !reader) return toast(!book ? 'Livro não encontrado.' : 'Leitor não encontrado.', 'error'); loading(button, true, 'Registrando…'); try { await runTransaction(db, async (tx) => { const bookRef = doc(db, 'books', book.id), snap = await tx.get(bookRef); if (!snap.exists() || Number(snap.data().available || 0) < 1) throw new Error('indisponível'); const free = Number(snap.data().available || 0) - 1, due = new Date(); due.setDate(due.getDate() + days); tx.update(bookRef, { available: free, status: free ? 'disponivel' : 'emprestado', updatedAt: serverTimestamp() }); tx.set(doc(collection(db, 'loans')), { schoolId: config.currentSchoolId, bookId: book.id, bookCode: book.code, bookTitle: book.title, readerId: reader.id, readerName: reader.name, readerCourse: reader.course || 'Não se aplica', days, dueAt: Timestamp.fromDate(due), status: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }) }); $('#bookCodeInput').value = ''; $('#readerInput').value = ''; $('#readerSelectInput').value = ''; toast('Empréstimo registrado.') } catch (err) { error(err, err.message === 'indisponível' ? 'Livro indisponível.' : 'Não foi possível registrar o empréstimo.') } finally { loading(button, false) } }
async function returnLoan(id) { try { await runTransaction(db, async (tx) => { const loanRef = doc(db, 'loans', id), loan = await tx.get(loanRef); if (!loan.exists() || loan.data().status !== 'active') throw new Error('inválido'); const bookRef = doc(db, 'books', loan.data().bookId), book = await tx.get(bookRef); tx.update(loanRef, { status: 'returned', returnedAt: serverTimestamp(), updatedAt: serverTimestamp() }); if (book.exists()) { const free = Math.min(Number(book.data().available || 0) + 1, Number(book.data().total || 0)); tx.update(bookRef, { available: free, status: free ? 'disponivel' : 'emprestado', updatedAt: serverTimestamp() }) } }); toast('Livro devolvido.') } catch (err) { error(err, 'Não foi possível registrar a devolução.') } }
async function renewLoan(id) {
  const loan = state.loans.find((l) => l.id === id)
  if (!loan) return
  const select = document.querySelector(`[data-renew-days="${id}"]`)
  const days = Number(select?.value || loan.days || 7)
  try {
    const due = date(loan.dueAt) ? new Date(date(loan.dueAt)) : new Date()
    due.setDate(due.getDate() + days)
    await updateDoc(doc(db, 'loans', id), { days, dueAt: Timestamp.fromDate(due), updatedAt: serverTimestamp() })
    toast(`Renovação concluída por ${days} dias.`)
  } catch (err) { error(err, 'Não foi possível renovar o empréstimo.') }
}
function notify(id) { const loan = state.loans.find((l) => l.id === id), reader = state.readers.find((r) => r.id === loan?.readerId); if (!loan) return; $('#notificationContact').textContent = `${reader?.email || 'E-mail não informado'} · ${reader?.phone || 'Telefone não informado'}`; $('#notificationMessage').value = `Olá, ${loan.readerName}. O empréstimo do livro "${loan.bookTitle}" vence em ${formatDate(loan.dueAt)}. Por favor, procure a ${config.schoolName}.`; const modalEl = $('#notificationModal'); modalEl.dataset.loanId = String(id); modal('notificationModal', true) }

function normalizePhone(phone = '') {
  return String(phone || '').replace(/\D/g, '')
}

function openWhatsAppMessage(reader, message) {
  const phone = normalizePhone(reader?.phone)
  if (!phone) return false
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

async function sendEmailNotification(reader, message, loan) {
  const email = String(reader?.email || '').trim()
  if (!email) return false
  const emailjsReady = typeof window !== 'undefined' && !!window.emailjs
  const serviceId = config.emailjs.serviceId
  const templateId = config.emailjs.templateId
  const publicKey = config.emailjs.publicKey
  const dueDate = loan ? formatDate(loan.dueAt) : '—'

  if (!emailjsReady || !serviceId || !templateId || !publicKey) {
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Aviso de biblioteca')}&body=${encodeURIComponent(message)}`
    return true
  }

  try {
    window.emailjs.init({ publicKey })
    await window.emailjs.send(serviceId, templateId, {
      to_email: email,
      to_name: reader?.name || 'Leitor',
      subject: 'Aviso de biblioteca',
      message,
      organization: config.organizationName,
      school_name: config.schoolName,
      escola: config.schoolName,
      name: reader?.name || 'Leitor',
      livro: loan?.bookTitle || '',
      loan_days: Number(loan?.days || 0),
      data_vencimento: dueDate,
      date: dueDate,
      message
    })
    return true
  } catch (error) {
    console.error('EmailJS failed:', error)
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Aviso de biblioteca')}&body=${encodeURIComponent(message)}`
    return true
  }
}

async function triggerNotification(type) {
  const notificationModal = $('#notificationModal')
  const loanId = notificationModal.dataset.loanId
  const loan = state.loans.find((item) => item.id === loanId)
  const reader = state.readers.find((item) => item.id === loan?.readerId)
  const message = $('#notificationMessage').value.trim()
  if (!loan || !reader || !message) return toast('Não foi possível enviar a notificação.', 'error')

  if (type === 'whatsapp') {
    const sent = openWhatsAppMessage(reader, message)
    if (!sent) return toast('Este leitor não possui telefone para WhatsApp.', 'error')
    toast('WhatsApp aberto com a mensagem.')
    modal('notificationModal', false)
    return
  }

  const sent = await sendEmailNotification(reader, message, loan)
  if (!sent) return toast('Este leitor não possui e-mail para envio.', 'error')
  toast('E-mail enviado ou preparado para envio.')
  modal('notificationModal', false)
}
function exportCsv() { const rows = [['Código', 'Título', 'Autor', 'Categoria', 'Disponíveis', 'Total', 'Tombamento'], ...state.books.map((b) => [b.code, b.title, b.author, label(b.categoryId), b.available, b.total, b.tombamento || ''])], csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(';')).join('\n'), a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); a.download = 'relatorio-acervo.csv'; a.click(); URL.revokeObjectURL(a.href) }
function exportXlsx() { const rows = [['Código', 'Título', 'Autor', 'Categoria', 'Disponíveis', 'Total', 'Tombamento'], ...state.books.map((b) => [b.code, b.title, b.author, label(b.categoryId), b.available, b.total, b.tombamento || ''])]; const sheet = XLSX.utils.aoa_to_sheet(rows); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Acervo'); XLSX.writeFile(workbook, 'relatorio-acervo.xlsx') }
function subscribeBooks() {
  if (!canUseFirebase || !db) return
  state.unsubs.push(onSnapshot(query(collection(db, 'books'), where('schoolId', '==', config.currentSchoolId)), (snap) => {
    state.books = snap.docs.map((d) => {
      const data = d.data()
      const total = Number(data.total || 0)
      const available = Number(data.available ?? total)
      return { id: d.id, ...data, total, available, status: available > 0 ? 'disponivel' : 'emprestado' }
    })
    renderPublicBooks(); renderBooks(); renderDashboard()
  }, (err) => error(err)))
}
function subscribeCategories() {
  if (!canUseFirebase || !db) return
  state.unsubs.push(onSnapshot(query(collection(db, 'categories'), where('schoolId', '==', config.currentSchoolId)), (snap) => {
    state.categories = snap.docs.map((d) => ({ id: d.data().id || d.id, ...d.data() }))
    renderCategories();
    renderCategorySelect();
    renderCategoryList();
    renderPublicBooks();
    renderBooks();
    renderDashboard();
  }, (err) => error(err)))
}
function clearAdminSubscriptions() { while (state.unsubs.length > 1) state.unsubs.pop()() }
function subscribeAdmin() {
  if (!canUseFirebase || !db || !auth) return
  clearAdminSubscriptions();
  const activeSchoolId = config.currentSchoolId
  state.unsubs.push(onSnapshot(query(collection(db, 'readers'), where('schoolId', '==', activeSchoolId)), (snap) => { state.readers = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderReaders(); renderDashboard() }, (err) => error(err)));
  state.unsubs.push(onSnapshot(query(collection(db, 'loans'), where('schoolId', '==', activeSchoolId)), (snap) => { state.loans = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderLoans(); renderDashboard() }, (err) => error(err)))
  subscribeCategories()
}
function view(name) { $('#publicView').classList.toggle('is-active', name === 'public'); $('#adminView').classList.toggle('is-active', name === 'admin'); $$('.nav-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.view === name)) }
function setup() { $$('.nav-btn').forEach((b) => b.onclick = () => b.dataset.view === 'admin' && !state.user ? modal('loginModal', true) : view(b.dataset.view)); $$('.tab-btn').forEach((b) => b.onclick = () => tab(b.dataset.tab)); $('#searchInput').oninput = (x) => { state.query = x.target.value; renderPublicBooks() }; $('#acervoSearchInput').oninput = (x) => { state.acervoQuery = x.target.value; renderBooks() }; $('#readerSearchInput').oninput = (x) => { state.readerQuery = x.target.value; renderReaders() }; $('#readerSelectInput').onchange = () => { const id = $('#readerSelectInput').value; const reader = state.readers.find((item) => item.id === id); $('#readerInput').value = reader ? (reader.matricula || reader.name) : ''; }; $$('.filter-btn').forEach((b) => b.onclick = () => { state.status = b.dataset.status; $$('.filter-btn').forEach((x) => x.classList.toggle('is-active', x === b)); renderPublicBooks() }); $('#bookForm').onsubmit = addBook; $('#categoryForm').onsubmit = addCategory; $('#readerForm').onsubmit = addReader; $('#readerTypeInput').onchange = updateReaderFields; $('#registerLoanBtn').onclick = registerLoan; $('#scanBtn').onclick = () => toast('Leitura por câmera indisponível. Digite o ID do livro.', 'error'); $('#addBookBtn').onclick = () => openForm('acervo', '#bookFormPanel', '#bookTitleInput'); $('#addReaderBtn').onclick = () => openForm('leitores', '#readerFormPanel', '#readerNameInput'); $('#exportBtn').onclick = exportCsv; $('#exportXlsxBtn').onclick = exportXlsx; $$('.modal [data-close]').forEach((b) => b.onclick = () => modal(b.dataset.close, false)); $('#copyNotificationBtn').onclick = async () => { try { await navigator.clipboard.writeText($('#notificationMessage').value); toast('Mensagem copiada.') } catch { toast('Não foi possível copiar.', 'error') } }; $('#sendWhatsappBtn').onclick = () => triggerNotification('whatsapp'); $('#sendEmailBtn').onclick = () => triggerNotification('email'); $('#logoutBtn').onclick = async () => {
  if (!canUseFirebase || !auth) {
    state.user = null;
    $('#logoutBtn').classList.add('hidden');
    view('public');
    toast('Sessão local encerrada.');
    return
  }
  try { await signOut(auth); toast('Sessão encerrada.') } catch (err) { error(err) }
};
}
$('#loginForm').onsubmit = async (x) => {
  x.preventDefault();
  const email = $('#loginForm input[type="email"]').value.trim();
  const password = $('#loginForm input[type="password"]').value;
  const b = $('#loginForm button[type="submit"]');
  loading(b, true, 'Entrando…');

  if (!canUseFirebase || !auth) {
    if (email.toLowerCase() === demoAdmin.email && password === demoAdmin.password) {
      state.user = { email };
      $('#logoutBtn').classList.remove('hidden');
      modal('loginModal', false);
      view('admin');
      toast('Login local realizado com sucesso.');
      loading(b, false);
      return
    }

    toast('Credenciais inválidas. Use admin@teste.com / 123456', 'error');
    loading(b, false);
    return
  }

  try { await signInWithEmailAndPassword(auth, email, password); modal('loginModal', false) } catch (err) { error(err) } finally { loading(b, false) }
};
$('#resetPasswordBtn').onclick = async () => { const email = $('#loginForm input[type="email"]').value.trim(); if (!email) return toast('Informe seu e-mail.', 'error'); if (!canUseFirebase || !auth) return toast('A recuperação de senha local não está ativa. Use o login de teste disponível.', 'error'); try { const methods = await fetchSignInMethodsForEmail(auth, email); if (!methods || !methods.length) return toast('Este e-mail não está cadastrado no sistema.', 'error'); await sendPasswordResetEmail(auth, email); toast('E-mail de recuperação enviado.') } catch (err) { if (err?.code === 'auth/user-not-found') return toast('Este e-mail não está cadastrado no sistema.', 'error'); error(err, 'Não foi possível enviar a recuperação.') } }
async function init() {
  setup();
  updateReaderFields();
  renderCategories();
  if (!canUseFirebase || !db) {
    hydrateFallbackData();
    state.user = null;
    $('#logoutBtn').classList.add('hidden');
    view('public');
    return
  }
  await ensureCurrentSchoolId();
  renderCategorySelect();
  renderCategoryList();
  renderPublicBooks();
  renderBooks();
  renderReaders();
  renderLoans();
  renderDashboard();
  try {
    const school = await getDoc(doc(db, 'schools', config.currentSchoolId));
    if (school.exists() && school.data().name) config.schoolName = school.data().name;
    $('#schoolName').textContent = config.schoolName;
  } catch (err) { error(err) }
  subscribeBooks();
  subscribeCategories();
  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    $('#logoutBtn').classList.toggle('hidden', !user);
    if (user) {
      await resolveUserSchool(user);
      clearAdminSubscriptions();
      subscribeBooks();
      subscribeAdmin();
    } else {
      clearAdminSubscriptions();
      state.readers = [];
      state.loans = [];
      renderReaders();
      renderLoans();
      renderDashboard();
      view('public');
    }
  })
}
init()
