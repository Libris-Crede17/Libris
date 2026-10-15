
// Defensive logout binding: ensures the button always invokes a clean signOut flow even when a stale onclick was registered earlier.
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn')
  if (!logoutBtn) return

  // Remove any stale property-based click handler so the final binding is deterministic.
  logoutBtn.onclick = null

  logoutBtn.addEventListener('click', async (event) => {
    event.preventDefault()
    event.stopPropagation()

    console.debug('[logout] user clicked logout button')

    try {
      clearAdminSubscriptions?.()
    } catch (error) {
      console.warn('[logout] clearAdminSubscriptions failed:', error)
    }

    if (!canUseFirebase || !auth) {
      state.user = null
      state.profile = null
      state.books = []
      state.readers = []
      state.loans = []
      state.categories = []
      renderBooks?.()
      renderReaders?.()
      renderLoans?.()
      renderCategoryList?.()
      renderDashboard?.()
      modal?.('loginModal', true)
      setTimeout(() => {
        document.querySelector('#loginForm input[type="email"]')?.focus()
      }, 150)
      toast('Sessão encerrada.', 'success')
      return
    }

    try {
      await signOut(auth)
      toast('Sessão encerrada.', 'success')
    } catch (err) {
      console.error('[logout] signOut failed:', err)
      error(err, 'Não foi possível encerrar a sessão.')
      modal?.('loginModal', true)
      setTimeout(() => {
        document.querySelector('#loginForm input[type="email"]')?.focus()
      }, 150)
    }
  })
})
