
/* -------------------------
   Initialization / auth flow
   ------------------------- */
function hydrateFallbackData() {
  state.categories = [...defaultCategories]
  state.books = fallbackBooks.map((book) => {
    const total = Number(book.total || 0)
    const available = Number(book.available ?? total)
    return { ...book, total, available, status: available > 0 ? 'disponivel' : 'emprestado' }
  })
  state.readers = fallbackReaders
  state.loans = fallbackLoans.map((loan) => ({ ...loan, dueAt: loan.dueAt instanceof Date ? loan.dueAt : new Date(loan.dueAt), status: loan.status || 'active' }))
  renderCategorySelect?.()
  renderCategoryList?.()
  renderBooks?.()
  renderReaders?.()
  renderLoans?.()
  renderDashboard?.()
}

/*
 * Flow de autenticação e carga administrativa
 * - quando o usuário está deslogado, força abertura do modal de login
 * - quando o admin valida, dispara subscribeAdmin() imediatamente
 * - ao sair, limpa escutas e reinicia o estado para evitar interface vazia
 */
onAuthStateChanged(auth, async (user) => {
  state.user = user
  if ($('#logoutBtn')) $('#logoutBtn').classList.toggle('hidden', !user)

  if (!user) {
    try { clearAdminSubscriptions?.() } catch (e) { console.warn('clearAdminSubscriptions failed on logout:', e) }
    state.profile = null
    state.readers = []
    state.loans = []
    state.books = []
    state.categories = []
    renderReaders?.()
    renderLoans?.()
    renderBooks?.()
    renderCategoryList?.()
    renderDashboard?.()
    modal?.('loginModal', true)
    setTimeout(() => {
      document.querySelector('#loginForm input[type="email"]')?.focus()
    }, 150)
    return
  }

  const schoolBeforeProfile = config.currentSchoolId
  state.profile = await resolveUserSchool(user)

  if (state.profile?.role !== 'admin') {
    try { clearAdminSubscriptions?.() } catch (e) { console.warn('clearAdminSubscriptions failed on invalid role:', e) }
    state.profile = null
    state.user = null
    state.readers = []
    state.loans = []
    state.books = []
    state.categories = []
    renderReaders?.()
    renderLoans?.()
    renderBooks?.()
    renderCategoryList?.()
    renderDashboard?.()
    toast('Esta conta não possui acesso administrativo.', 'error')
    try { await signOut(auth) } catch (e) { console.warn('Forced signOut failed:', e) }
    modal?.('loginModal', true)
    setTimeout(() => {
      document.querySelector('#loginForm input[type="email"]')?.focus()
    }, 150)
    return
  }

  // Admin validado: carrega dados imediatamente em tempo real para a escola atual.
  subscribeAdmin()
  modal?.('loginModal', false)

  if (schoolBeforeProfile !== config.currentSchoolId) {
    subscribeAdmin()
  }
})

function setup() {
  // Tabs
  $$('.tab-btn').forEach((b) => b.onclick = () => {
    $$('.tab-btn').forEach((tb) => tb.classList.toggle('is-active', tb === b))
    $$('.tab-panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === b.dataset.tab))
  })

  if ($('#acervoSearchInput')) $('#acervoSearchInput').oninput = (x) => { state.acervoQuery = x.target.value; renderBooks?.() }
  if ($('#readerSearchInput')) $('#readerSearchInput').oninput = (x) => { state.readerQuery = x.target.value; renderReaders?.() }
  if ($('#readerSelectInput')) $('#readerSelectInput').onchange = () => {
    const id = $('#readerSelectInput')?.value
    const reader = state.readers.find((item) => item.id === id)
    if ($('#readerInput')) $('#readerInput').value = reader ? (reader.matricula || reader.name) : ''
  }

  if ($('#bookForm')) $('#bookForm').onsubmit = addBook
  if ($('#categoryForm')) $('#categoryForm').onsubmit = addCategory
  if ($('#readerForm')) $('#readerForm').onsubmit = addReader
  if ($('#schoolSettingsForm')) $('#schoolSettingsForm').onsubmit = saveSchoolSettings
  if ($('#readerTypeInput')) $('#readerTypeInput').onchange = updateReaderFields
  if ($('#registerLoanBtn')) $('#registerLoanBtn').onclick = registerLoan
  if ($('#scanBtn')) $('#scanBtn').onclick = startQrScanner

  if ($('#openBookModalBtn')) $('#openBookModalBtn').onclick = () => { resetBookForm(); modal('bookFormModal', true) }
  if ($('#openReaderModalBtn')) $('#openReaderModalBtn').onclick = () => { resetReaderForm(); modal('readerFormModal', true) }
  if ($('#openCategoryModalBtn')) $('#openCategoryModalBtn').onclick = () => { if ($('#categoryForm')) $('#categoryForm').reset(); modal('categoryModal', true) }

  if ($('#cancelBookEditBtn')) $('#cancelBookEditBtn').onclick = () => modal('bookFormModal', false)
  if ($('#cancelReaderEditBtn')) $('#cancelReaderEditBtn').onclick = () => modal('readerFormModal', false)
  if ($('#exportBtn')) $('#exportBtn').onclick = exportCsv
  if ($('#exportXlsxBtn')) $('#exportXlsxBtn').onclick = exportXlsx

  $$('.modal [data-close]').forEach((b) => b.onclick = () => { if (b.dataset.close === 'qrScannerModal') stopQrScanner(); modal(b.dataset.close, false) })

  if ($('#copyNotificationBtn')) $('#copyNotificationBtn').onclick = async () => { try { await navigator.clipboard.writeText($('#notificationMessage')?.value || ''); toast('Mensagem copiada.') } catch { toast('Não foi possível copiar.', 'error') } }
  if ($('#sendWhatsappBtn')) $('#sendWhatsappBtn').onclick = () => triggerNotification('whatsapp')
  if ($('#sendEmailBtn')) $('#sendEmailBtn').onclick = () => triggerNotification('email')
  if ($('#sendCoordinationBtn')) $('#sendCoordinationBtn').onclick = () => triggerNotification('coordination')

  if ($('#logoutBtn')) $('#logoutBtn').onclick = async () => {
    try { clearAdminSubscriptions?.() } catch (e) { console.warn('clearAdminSubscriptions failed before signOut:', e) }
    state.profile = null
    state.readers = []
    state.loans = []
    state.books = []
    state.categories = []
    renderReaders?.()
    renderLoans?.()
    renderBooks?.()
    renderCategoryList?.()
    renderDashboard?.()

    if (!canUseFirebase || !auth) {
      state.user = null
      if ($('#logoutBtn')) $('#logoutBtn').classList.add('hidden')
      modal?.('loginModal', true)
      toast('Sessão local encerrada.')
      return
    }

    try {
      await signOut(auth)
      modal?.('loginModal', true)
      toast('Sessão encerrada.')
    } catch (err) {
      error(err, 'Não foi possível encerrar a sessão.')
      modal?.('loginModal', true)
    }
  }
}
