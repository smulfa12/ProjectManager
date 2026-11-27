/**
 * Menu 7 — Setting (khusus Admin)
 *  7.1 User parameter: user & client yang di-handle
 *  + Master data, Reminder email, dan Data / koneksi.
 */
import * as master from '../../service/master.service.js';
import * as store from '../../service/store.service.js';
import * as auth from '../../service/auth.service.js';
import { loadDemo } from '../../service/demo.service.js';
import { esc, pageHeader, tabs, bindTabs, attempt, confirmDialog } from '../../service/ui.service.js';
import { renderUsers } from './settings-users.js';
import { renderMaster } from './settings-master.js';

const TABS = [
  ['users', '👥 User & Client'],
  ['master', '🗂️ Master Data'],
  ['reminder', '⏰ Reminder Email'],
  ['data', '💾 Data & Koneksi'],
];

/** Jam WIB "07:30" → cron UTC hari kerja "30 0 * * 1-5". */
function cronOf(time) {
  const [h, m] = (time || '07:30').split(':').map(Number);
  return `${m || 0} ${(((h || 0) - 7) % 24 + 24) % 24} * * 1-5`;
}

function renderReminder(el) {
  const cfg = master.reminder();
  el.innerHTML = `
    <div class="grid grid--2">
      <section class="card">
        <div class="card__head"><h3>⏰ Pengaturan Reminder</h3></div>
        <form class="form" data-form>
          <label class="field check"><input type="checkbox" name="enabled" ${cfg.enabled ? 'checked' : ''} /> Kirim reminder otomatis setiap hari kerja</label>
          <div class="form-grid form-grid--2">
            <label class="field"><span>Jam kirim (WIB)</span><input class="input" type="time" name="time" value="${esc(cfg.time)}" /></label>
            <label class="field"><span>CC (pisahkan koma)</span><input class="input" name="cc" value="${esc(cfg.cc)}" placeholder="pm@perusahaan.com" /></label>
            <label class="field span-2"><span>URL aplikasi (tombol di email)</span><input class="input" name="appUrl" value="${esc(cfg.appUrl || location.href.split('#')[0])}" /></label>
          </div>
          <p class="muted small">Penerima diatur per user (Setting → User & Client → "Terima email reminder").</p>
          <div class="form-actions"><button class="btn btn--primary btn--sm">Simpan</button></div>
        </form>
      </section>
      <section class="card">
        <div class="card__head"><h3>🛠️ Setup pengiriman otomatis (sekali)</h3></div>
        <ol class="steps small">
          <li>Deploy Edge Function: <code>supabase functions deploy daily-reminder --no-verify-jwt</code> (file <code>service/functions/daily-reminder/index.ts</code>).</li>
          <li>Isi secret: <code>supabase secrets set RESEND_API_KEY=… MAIL_FROM="PM &lt;pm@domain.com&gt;" CRON_SECRET=…</code></li>
          <li>Aktifkan extension <b>pg_cron</b> & <b>pg_net</b>, lalu jalankan <code>service/database/002_reminder_cron.sql</code>.</li>
          <li>Jadwal cron untuk jam di samping: <code data-cron>${cronOf(cfg.time)}</code> (UTC). Ganti baris jadwal di SQL bila jam diubah.</li>
        </ol>
        <p class="muted small">Tombol "Kirim sekarang" di menu Reminder memakai Edge Function yang sama.</p>
      </section>
    </div>`;
  const form = el.querySelector('[data-form]');
  form.time.addEventListener('input', () => (el.querySelector('[data-cron]').textContent = cronOf(form.time.value)));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await attempt(
      () => master.save('pm.reminder', { enabled: form.enabled.checked, time: form.time.value || '07:30', cc: form.cc.value.trim(), appUrl: form.appUrl.value.trim() }),
      'Pengaturan reminder disimpan'
    );
  });
}

function renderData(el, refresh) {
  const cloud = store.mode() === 'cloud';
  const count = (k) => store.all(k).length;
  el.innerHTML = `
    <div class="grid grid--2">
      <section class="card">
        <div class="card__head"><h3>🔌 Koneksi</h3></div>
        <dl class="dl">
          <dt>Mode</dt><dd>${cloud ? '☁️ Supabase (cloud, realtime)' : '💻 Lokal (data di browser ini)'}</dd>
          <dt>Login</dt><dd>${esc(auth.currentUser()?.email || '-')}</dd>
          <dt>Role</dt><dd>${esc(auth.roleLabel())}</dd>
          <dt>Data</dt><dd>${count('clients')} client · ${count('projects')} project · ${count('activities')} activity · ${count('members')} user</dd>
        </dl>
        <div class="form-actions"><button class="btn btn--ghost btn--sm" data-reload>↻ Muat ulang data</button></div>
      </section>
      <section class="card">
        <div class="card__head"><h3>🧪 Data contoh</h3></div>
        <p class="small">Isi 3 client, 5 user, 8 project & 15 activity contoh untuk mencoba semua menu.${cloud ? ' Data akan disimpan ke database Supabase.' : ''}</p>
        <div class="form-actions">
          ${cloud ? '' : '<button class="btn btn--danger-ghost btn--sm mr-auto" data-reset>Hapus semua data lokal</button>'}
          <button class="btn btn--primary btn--sm" data-demo>Isi data contoh</button>
        </div>
      </section>
    </div>`;
  el.querySelector('[data-reload]').onclick = async () => {
    await attempt(() => auth.reload(), 'Data dimuat ulang');
    refresh();
  };
  el.querySelector('[data-demo]').onclick = async () => {
    if (!(await confirmDialog('Isi data contoh? Data contoh dengan ID yang sama akan ditimpa.'))) return;
    await attempt(loadDemo, 'Data contoh dimuat');
    refresh();
  };
  el.querySelector('[data-reset]')?.addEventListener('click', async () => {
    if (!(await confirmDialog('Hapus SEMUA data lokal di browser ini?', { okText: 'Hapus', danger: true }))) return;
    store.resetLocal();
    refresh();
  });
}

export default {
  path: '/settings',
  title: 'Setting',
  render(el, params) {
    let tab = params.tab || 'users';
    el.innerHTML = `
      ${pageHeader({ title: 'Setting', subtitle: 'User parameter, master data, reminder & data', icon: '⚙️' })}
      ${tabs(TABS, tab)}
      <div data-body></div>`;
    const body = el.querySelector('[data-body]');
    const show = (t) => {
      tab = t;
      history.replaceState(null, '', `#/settings?tab=${t}`);
      if (t === 'users') renderUsers(body);
      if (t === 'master') renderMaster(body);
      if (t === 'reminder') renderReminder(body);
      if (t === 'data') renderData(body, () => show('data'));
    };
    bindTabs(el, show);
    show(tab);
  },
};
