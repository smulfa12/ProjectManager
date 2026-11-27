/**
 * Auth Service — login, sesi, realtime, dan hak akses user.
 *
 *  - Admin  : semua client + menu Setting.
 *  - PM / Member : hanya client yang di-handle (Setting → User & Client).
 *  - Mode lokal (tanpa Supabase): selalu admin.
 *
 * Hak akses yang sebenarnya dijaga di database (Row Level Security, lihat
 * database/001_schema.sql); di sini hanya untuk menyesuaikan tampilan.
 */
import * as db from './database.service.js';
import * as store from './store.service.js';

const USER_KEY = 'pm.user';

let user = null; // { email }
let adminRemote = false;
let unsubscribeRealtime = null;
let remoteCallback = () => {};

export const needsLogin = () => store.mode() === 'cloud' && !user;
export const currentUser = () => user;

/** Data member milik user yang login (berdasarkan email). */
export function currentMember() {
  if (!user) return null;
  const email = user.email.toLowerCase();
  return store.find('members', (m) => (m.email || '').toLowerCase() === email) || null;
}

export function isAdmin() {
  if (store.mode() === 'local') return true;
  const me = currentMember();
  if (me) return me.role === 'admin' && me.active !== false;
  return adminRemote; // belum terdaftar sebagai member: ikuti database (setup awal)
}

export const roleLabel = () => (isAdmin() ? 'Admin' : currentMember()?.role === 'pm' ? 'Project Manager' : 'Member');

/** Daftar id client yang boleh dilihat user ini. */
export function allowedClientIds() {
  if (isAdmin()) return store.all('clients').map((c) => c.id);
  return currentMember()?.clientIds || [];
}

export const canClient = (clientId) => isAdmin() || allowedClientIds().includes(clientId);

/* ---------- Realtime ---------- */

async function startRealtime() {
  if (store.mode() !== 'cloud') return;
  try {
    unsubscribeRealtime?.();
    unsubscribeRealtime = await db.subscribe((evt) => {
      store.applyRemote(evt);
      remoteCallback();
    });
  } catch (err) {
    console.warn('Realtime tidak aktif', err);
  }
}

async function afterLogin() {
  adminRemote = await db.isAdminRemote().catch(() => false);
  await store.loadAll();
  startRealtime();
}

/* ---------- Login / logout ---------- */

export async function login(email, password) {
  const session = await db.signIn(email.trim(), password);
  user = { email: session.user.email };
  localStorage.setItem(USER_KEY, user.email);
  await afterLogin();
}

export async function logout() {
  if (store.mode() === 'cloud') {
    try {
      await db.signOut();
    } catch { /* abaikan */ }
  }
  unsubscribeRealtime?.();
  unsubscribeRealtime = null;
  user = null;
  localStorage.removeItem(USER_KEY);
  store.clearMemory();
}

export async function reload() {
  if (store.mode() === 'cloud') adminRemote = await db.isAdminRemote().catch(() => adminRemote);
  await store.loadAll();
}

/**
 * Dipanggil sekali oleh app.js sebelum halaman pertama tampil.
 * onRemoteChange dipanggil setiap ada data baru dari user lain.
 */
export async function initAuth({ onRemoteChange } = {}) {
  if (onRemoteChange) remoteCallback = onRemoteChange;

  if (store.mode() === 'local') {
    user = { email: 'lokal@demo' };
    await store.loadAll();
    return;
  }

  try {
    const session = await db.getSession();
    if (session) {
      user = { email: session.user.email };
      await afterLogin();
    }
  } catch (err) {
    console.error('Gagal memuat sesi', err);
    user = null;
  }

  db.onAuthChange((event) => {
    if (event === 'SIGNED_OUT' && user) {
      user = null;
      location.hash = '#/login';
    }
  }).catch(() => {});

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && user) store.loadAll().then(() => remoteCallback()).catch(() => {});
  });
}
