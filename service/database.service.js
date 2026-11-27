/**
 * Database Service (Supabase)
 * Satu-satunya file yang berbicara langsung dengan Supabase:
 * login, ambil data, simpan / hapus baris, realtime, dan Edge Function.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.config.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/+esm';
const PAGE = 1000;

/**
 * Koleksi lokal → tabel database + kolom (nama JS, camelCase).
 * Urutan: tabel INDUK dulu (dipakai saat import data contoh ke database).
 */
export const TABLES = {
  members: {
    table: 'pm_members',
    columns: ['id', 'name', 'email', 'team', 'position', 'role', 'clientIds', 'dailyHours', 'reminder', 'active', 'createdAt', 'updatedAt'],
  },
  clients: {
    table: 'pm_clients',
    columns: ['id', 'code', 'name', 'freeMandays', 'contractDate', 'contractEnd', 'maintenancePrice', 'maintenanceTcv', 'sla', 'pmStart', 'pmEnd', 'pmFrequency', 'pricePerMandays', 'pic', 'notes', 'active', 'createdAt', 'updatedAt'],
  },
  projects: {
    table: 'pm_projects',
    columns: [
      'id', 'code', 'systemId', 'title', 'type', 'clientId', 'jiraNo', 'module', 'crNo', 'outstanding', 'date',
      'costType', 'mandays', 'priceTcv', 'revenue', 'grossProfit', 'bast', 'bastDate', 'picBank', 'picMlpt',
      'startDate', 'target', 'endDate', 'status', 'remark', 'notes', 'members', 'createdBy',
      'priority', 'reportedAt', 'slaTempDue', 'slaPermDue', 'tempDoneAt', 'permDoneAt', 'createdAt', 'updatedAt',
    ],
  },
  history: {
    table: 'pm_project_history',
    columns: ['id', 'projectId', 'action', 'changes', 'note', 'byEmail', 'createdAt', 'updatedAt'],
  },
  activities: {
    table: 'pm_activities',
    columns: ['id', 'projectId', 'memberId', 'title', 'description', 'planStart', 'planEnd', 'actualStart', 'actualEnd', 'planHours', 'progress', 'status', 'priority', 'createdAt', 'updatedAt'],
  },
  reminderLogs: {
    table: 'pm_reminder_logs',
    columns: ['id', 'memberId', 'email', 'subject', 'status', 'detail', 'source', 'createdAt', 'updatedAt'],
  },
};

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/* ---------- Konversi baris ---------- */

const snake = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

/** Nilai pengganti NULL untuk kolom non-teks. */
const EMPTY = { clientIds: [], members: [], changes: [], reminder: true, active: true, mandays: 0, priceTcv: 0, revenue: 0, grossProfit: 0, freeMandays: 0, pricePerMandays: 0, maintenancePrice: 0, maintenanceTcv: 0, sla: {}, progress: 0, planHours: 0, dailyHours: 8 };

export function toRow(key, obj) {
  const out = {};
  TABLES[key].columns.forEach((c) => {
    if (c in obj) out[snake(c)] = obj[c] === '' ? null : obj[c];
  });
  return out;
}

export function fromRow(key, row) {
  const out = {};
  TABLES[key].columns.forEach((c) => {
    const v = row[snake(c)];
    out[c] = v == null ? (c in EMPTY ? EMPTY[c] : '') : v;
  });
  return out;
}

const tableToKey = Object.fromEntries(Object.entries(TABLES).map(([k, v]) => [v.table, k]));

/* ---------- Client ---------- */

let clientPromise = null;
export function client() {
  if (!isConfigured()) return Promise.reject(new Error('Supabase belum dikonfigurasi'));
  if (!clientPromise) {
    clientPromise = import(SDK_URL)
      .then(({ createClient }) =>
        createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pm-auth' },
        })
      )
      .catch((err) => {
        clientPromise = null;
        throw err;
      });
  }
  return clientPromise;
}

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/* ---------- Auth ---------- */

export async function getSession() {
  const c = await client();
  return must(await c.auth.getSession()).session;
}

export async function signIn(email, password) {
  const c = await client();
  return must(await c.auth.signInWithPassword({ email, password })).session;
}

export async function signOut() {
  const c = await client();
  await c.auth.signOut();
}

export async function onAuthChange(callback) {
  const c = await client();
  c.auth.onAuthStateChange((event, session) => callback(event, session));
}

export async function isAdminRemote() {
  const c = await client();
  return must(await c.rpc('pm_is_admin')) === true;
}

/* ---------- Baca ---------- */

export async function fetchTable(key) {
  const c = await client();
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const data = must(await c.from(TABLES[key].table).select('*').order('id').range(from, from + PAGE - 1));
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows.map((r) => fromRow(key, r));
}

export async function fetchSettings() {
  const c = await client();
  const data = must(await c.from('pm_settings').select('key, value'));
  return Object.fromEntries(data.map((r) => [r.key, r.value]));
}

/* ---------- Tulis ---------- */

export async function upsertRows(key, rows) {
  const c = await client();
  for (let i = 0; i < rows.length; i += 500) {
    must(await c.from(TABLES[key].table).upsert(rows.slice(i, i + 500).map((r) => toRow(key, r))));
  }
}

export const upsertRow = (key, row) => upsertRows(key, [row]);

export async function deleteRow(key, id) {
  const c = await client();
  must(await c.from(TABLES[key].table).delete().eq('id', id));
}

export async function setSetting(key, value) {
  const c = await client();
  must(await c.from('pm_settings').upsert({ key, value, updated_at: new Date().toISOString() }));
}

/* ---------- Edge Function ---------- */

export async function invokeFunction(name, body) {
  const c = await client();
  const { data, error } = await c.functions.invoke(name, { body });
  if (error) {
    let detail = error.message;
    try {
      detail = (await error.context?.json())?.error || detail;
    } catch { /* abaikan */ }
    throw new Error(detail);
  }
  return data;
}

/* ---------- Realtime ---------- */

/** handler({ key, deleted, row }) untuk tabel, atau ({ setting, value }) untuk pengaturan. */
export async function subscribe(handler) {
  const c = await client();
  let channel = c.channel('pm-sync');
  Object.values(TABLES).forEach(({ table }) => {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => {
      const key = tableToKey[table];
      if (p.eventType === 'DELETE') handler({ key, deleted: true, row: { id: p.old.id } });
      else handler({ key, deleted: false, row: fromRow(key, p.new) });
    });
  });
  channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'pm_settings' }, (p) => {
    if (p.eventType === 'DELETE') handler({ setting: p.old.key, value: undefined });
    else handler({ setting: p.new.key, value: p.new.value });
  });
  channel.subscribe();
  return () => c.removeChannel(channel);
}
