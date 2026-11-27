/**
 * Router Service
 * Hash router kecil: "#/inventory/input?id=xxx".
 * Setiap modul program mendaftarkan { path, render } dan router
 * yang memanggil render() saat URL berubah.
 *
 * Opsi modul:
 *  - autoRefresh: false → halaman tidak di-render ulang otomatis saat
 *    ada data baru dari user lain (dipakai halaman form supaya isian tidak hilang).
 */
export function createRouter({ outlet, notFound = '/', onNavigate = () => {}, guard = () => null }) {
  const routes = new Map();
  let cleanup = null;
  let current = null;

  function parse() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const [path, query = ''] = hash.split('?');
    return { path, params: Object.fromEntries(new URLSearchParams(query)) };
  }

  async function resolve({ keepScroll = false } = {}) {
    const { path, params } = parse();
    const redirect = guard(path);
    if (redirect && redirect !== path) {
      location.hash = '#' + redirect;
      return;
    }
    const mod = routes.get(path) || routes.get(notFound);
    const scrollY = window.scrollY;
    if (typeof cleanup === 'function') {
      try { await cleanup(); } catch { /* abaikan */ }
    }
    cleanup = null;
    current = mod;
    outlet.innerHTML = '';
    const view = document.createElement('div');
    view.className = 'view' + (keepScroll ? ' view--still' : '');
    outlet.appendChild(view);
    if (mod.title) document.title = `${mod.title} · Project Manager`;
    try {
      onNavigate(path, mod);
      cleanup = await mod.render(view, params);
    } catch (err) {
      console.error(err);
      if (window.pmShowError) {
        outlet.innerHTML = '';
        window.pmShowError(err?.message || String(err));
      } else {
        view.innerHTML = `<div class="app-error"><b>⚠️ Halaman gagal ditampilkan</b><p>${String(err?.message || err).replace(/</g, '&lt;')}</p></div>`;
      }
    }
    window.scrollTo(0, keepScroll ? scrollY : 0);
  }

  return {
    register(mod) {
      routes.set(mod.path, mod);
      return this;
    },
    start() {
      window.addEventListener('hashchange', () => resolve());
      resolve();
    },
    refresh: () => resolve(),
    /** Render ulang halaman aktif di latar belakang (data baru dari server). */
    refreshInBackground(isBusy = () => false) {
      if (!current || current.autoRefresh === false || isBusy()) return;
      resolve({ keepScroll: true });
    },
  };
}

export const navigate = (path) => (location.hash = '#' + path);
