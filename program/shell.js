/**
 * Shell — kerangka aplikasi: sidebar menu, info user, tombol logout,
 * dan penanda menu aktif. Menu Setting hanya tampil untuk admin.
 */
import * as auth from '../service/auth.service.js';
import * as store from '../service/store.service.js';
import { esc, confirmDialog } from '../service/ui.service.js';
import { navigate } from '../service/router.service.js';

export const MENU = [
  { path: '/', section: 'dashboard', icon: '📊', label: 'Dashboard Workload' },
  { path: '/inquiry', section: 'inquiry', icon: '🔎', label: 'Inquiry Project' },
  { path: '/project', section: 'project', icon: '📁', label: 'List Project' },
  { path: '/activity', section: 'activity', icon: '🗓️', label: 'Activity Member' },
  { path: '/client', section: 'client', icon: '🏦', label: 'Monitoring Client' },
  { path: '/trend', section: 'trend', icon: '📈', label: 'History Trend' },
  { path: '/reminder', section: 'reminder', icon: '⏰', label: 'Reminder' },
  { path: '/settings', section: 'settings', icon: '⚙️', label: 'Setting', admin: true },
];

/** Hanya admin yang boleh membuka halaman Setting. */
export function canOpen(path) {
  const item = MENU.find((m) => m.path !== '/' && (path === m.path || path.startsWith(m.path + '/')));
  return !item?.admin || auth.isAdmin();
}

function renderUser() {
  const box = document.querySelector('[data-user]');
  if (!box) return;
  const user = auth.currentUser();
  const me = auth.currentMember();
  box.innerHTML = user
    ? `
      <div class="userbox__name">${esc(me?.name || user.email)}</div>
      <div class="userbox__role">${esc(auth.roleLabel())}${store.mode() === 'local' ? ' · Mode lokal' : ''}</div>
      ${store.mode() === 'cloud' ? '<button class="btn btn--sm btn--ghost-dark" data-logout>Keluar</button>' : ''}`
    : '';
  box.querySelector('[data-logout]')?.addEventListener('click', async () => {
    if (!(await confirmDialog('Keluar dari aplikasi?', { okText: 'Keluar' }))) return;
    await auth.logout();
    navigate('/login');
  });
}

/** Pasang sidebar sekali di awal. */
export function setupShell() {
  const nav = document.querySelector('[data-nav]');
  nav.innerHTML = MENU.map((m) => `<a href="#${m.path}" data-section="${m.section}"><span class="nav__icon">${m.icon}</span><span>${m.label}</span></a>`).join('');
  document.querySelector('[data-menu-toggle]')?.addEventListener('click', () => document.body.classList.toggle('nav-open'));
  document.querySelector('[data-nav-backdrop]')?.addEventListener('click', () => document.body.classList.remove('nav-open'));
}

/** Tandai menu aktif & sesuaikan dengan role user. Dipanggil setiap pindah halaman. */
export function highlightNav(path) {
  document.body.classList.toggle('auth-page', path === '/login');
  document.body.classList.remove('nav-open');
  const active = MENU.find((m) => m.path !== '/' && (path === m.path || path.startsWith(m.path + '/')))?.section || 'dashboard';
  document.querySelectorAll('[data-nav] a').forEach((a) => {
    const item = MENU.find((m) => m.section === a.dataset.section);
    a.classList.toggle('on', a.dataset.section === active);
    a.classList.toggle('hidden', Boolean(item.admin) && !auth.isAdmin());
  });
  renderUser();
}
