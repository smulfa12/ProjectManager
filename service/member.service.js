/**
 * Member Service — user / anggota tim dan parameter client yang di-handle.
 * Login Supabase dicocokkan dengan member lewat email.
 */
import * as store from './store.service.js';

export const list = ({ includeInactive = true } = {}) =>
  store.filter('members', (m) => includeInactive || m.active !== false).sort((a, b) => a.name.localeCompare(b.name));

export const get = (id) => store.get('members', id);
export const nameOf = (id) => get(id)?.name || 'Belum di-assign';
export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

/** Member yang meng-handle client tertentu. */
export const handlersOf = (clientId) => list({ includeInactive: false }).filter((m) => m.role === 'admin' || (m.clientIds || []).includes(clientId));

export async function save(id, input) {
  const data = {
    name: String(input.name || '').trim(),
    email: String(input.email || '').trim().toLowerCase(),
    team: input.team || '',
    position: String(input.position || '').trim(),
    role: ['admin', 'pm', 'member'].includes(input.role) ? input.role : 'member',
    clientIds: Array.isArray(input.clientIds) ? input.clientIds : [],
    dailyHours: Number(input.dailyHours) || 8,
    reminder: input.reminder !== false,
    active: input.active !== false,
  };
  if (!data.name) throw new Error('Nama wajib diisi');
  if (data.email && store.find('members', (m) => (m.email || '').toLowerCase() === data.email && m.id !== id)) {
    throw new Error('Email sudah dipakai member lain');
  }
  return id ? store.update('members', id, data) : store.add('members', data);
}

export async function remove(id) {
  if (store.find('activities', (a) => a.memberId === id)) throw new Error('Member masih punya activity. Nonaktifkan saja.');
  return store.remove('members', id);
}

/** Avatar bulat dengan inisial & warna konsisten per nama. */
export function avatar(member, size = 28) {
  const name = member?.name || '?';
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `<span class="avatar" style="--size:${size}px;--hue:${h}" title="${name.replace(/"/g, '&quot;')}">${initials(name)}</span>`;
}
