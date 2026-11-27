/**
 * Menu 6 — Reminder User Activity & Target Daily via Email
 * Preview isi reminder per member, kirim sekarang (Edge Function), draft email,
 * dan log pengiriman. Pengiriman otomatis tiap pagi diatur lewat pg_cron.
 */
import * as reminder from '../../service/reminder.service.js';
import * as members from '../../service/member.service.js';
import * as master from '../../service/master.service.js';
import * as store from '../../service/store.service.js';
import * as auth from '../../service/auth.service.js';
import { esc, pageHeader, emptyState, badge, toast, confirmDialog, statCard, tabs, bindTabs } from '../../service/ui.service.js';
import { today, dateLabel, dateTimeLabel, number } from '../../service/format.service.js';
import { openActivityForm } from '../activity/activity-form.js';

function list(title, tone, items) {
  if (!items.length) return '';
  return `
    <div class="rem-list">
      <div class="rem-list__head tone-${tone}">${title} <b>${items.length}</b></div>
      <ul>${items
        .map((a) => {
          const p = store.get('projects', a.projectId);
          return `<li data-open="${esc(a.id)}"><span>${esc(a.title)}</span><small class="muted">${esc(p?.code || 'Internal')} · ${dateLabel(a.planStart)} – ${dateLabel(a.planEnd)} · ${a.progress || 0}%</small></li>`;
        })
        .join('')}</ul>
    </div>`;
}

function previewCards(rows, cloud) {
  if (!rows.length) return emptyState('⏰', 'Belum ada member penerima reminder', 'Tambahkan member & email di Setting → User & Client.');
  return `<div class="rem-grid">${rows
    .map(
      (r) => `
    <article class="card rem-card ${r.empty ? 'is-empty' : ''}">
      <header class="row gap-sm">
        ${members.avatar(r.member, 36)}
        <div class="grow"><b>${esc(r.member.name)}</b><div class="muted small">${esc(r.member.email || 'email belum diisi')}</div></div>
        ${r.overdue.length ? badge(`${r.overdue.length} terlambat`, 'red') : r.empty ? badge('Kosong', 'gray') : badge('OK', 'green')}
      </header>
      <p class="small">Target hari ini <b>${r.today.length}</b> activity${r.hours ? ` · ${number(r.hours)} jam dari kapasitas ${number(r.member.dailyHours || 8)} jam` : ''}</p>
      ${list('🎯 Target hari ini', 'blue', r.today)}
      ${list('⏰ Terlambat', 'red', r.overdue)}
      ${list('🔄 Sedang dikerjakan', 'amber', r.progress)}
      ${r.empty ? '<p class="muted small">Tidak ada activity — reminder tidak dikirim.</p>' : ''}
      <footer class="row gap-sm">
        ${cloud && auth.isAdmin() ? `<button class="btn btn--sm btn--primary" data-send="${esc(r.member.id)}" ${r.empty || !r.member.email ? 'disabled' : ''}>✉ Kirim</button>` : ''}
        <a class="btn btn--sm btn--ghost" href="${esc(reminder.mailtoLink(r))}" ${r.empty ? 'aria-disabled="true"' : ''}>Draft email</a>
        <button class="btn btn--sm btn--ghost" data-copy="${esc(r.member.id)}">Salin teks</button>
      </footer>
    </article>`
    )
    .join('')}</div>`;
}

function logTable() {
  const logs = reminder.logs();
  if (!logs.length) return emptyState('📭', 'Belum ada log pengiriman');
  const tone = { sent: 'green', failed: 'red', skipped: 'gray' };
  return `
    <div class="card card--flush"><div class="table-wrap"><table class="table table--compact">
      <thead><tr><th>Waktu</th><th>Member</th><th>Email</th><th>Subjek</th><th>Status</th><th>Sumber</th><th>Keterangan</th></tr></thead>
      <tbody>${logs
        .map((l) => `<tr><td>${dateTimeLabel(l.createdAt)}</td><td>${esc(members.nameOf(l.memberId))}</td><td>${esc(l.email || '-')}</td><td class="small">${esc(l.subject || '')}</td><td>${badge(l.status, tone[l.status] || 'gray')}</td><td>${esc(l.source || '')}</td><td class="small muted">${esc(l.detail || '')}</td></tr>`)
        .join('')}</tbody>
    </table></div></div>`;
}

export default {
  path: '/reminder',
  title: 'Reminder',
  render(el) {
    const cloud = store.mode() === 'cloud';
    const cfg = master.reminder();
    let date = today();
    let tab = 'preview';

    el.innerHTML = `
      ${pageHeader({
        title: 'Reminder Activity & Target Daily',
        subtitle: 'Email harian ke tiap member: target hari ini, activity terlambat & sedang dikerjakan',
        icon: '⏰',
        actions: `<input class="input input--sm" type="date" data-date value="${date}" />${cloud && auth.isAdmin() ? '<button class="btn btn--primary" data-send-all>✉ Kirim ke semua</button>' : ''}`,
      })}
      <div class="alert ${cfg.enabled ? 'alert--info' : 'alert--warn'}">
        ${cfg.enabled ? `🔔 Reminder otomatis <b>aktif</b> — dikirim setiap hari kerja pukul <b>${esc(cfg.time)} WIB</b> (pg_cron + Edge Function <code>daily-reminder</code>).` : '🔕 Reminder otomatis <b>dimatikan</b>.'}
        ${cloud ? '' : ' Mode lokal: pengiriman email butuh Supabase — gunakan "Draft email".'}
        ${auth.isAdmin() ? ' <a href="#/settings?tab=reminder">Atur reminder →</a>' : ''}
      </div>
      <div data-stats></div>
      ${tabs([['preview', '👀 Preview per member'], ['log', '📜 Log pengiriman']], tab)}
      <div data-body></div>`;

    const body = el.querySelector('[data-body]');
    const statsEl = el.querySelector('[data-stats]');
    let rows = [];

    const draw = () => {
      rows = reminder.preview(date);
      statsEl.innerHTML = `<div class="stats stats--sm">
        ${statCard({ label: 'Penerima', value: number(rows.filter((r) => !r.empty && r.member.email).length), hint: `dari ${rows.length} member aktif`, tone: 'blue' })}
        ${statCard({ label: 'Target hari ini', value: number(rows.reduce((s, r) => s + r.today.length, 0)), tone: 'purple' })}
        ${statCard({ label: 'Terlambat', value: number(rows.reduce((s, r) => s + r.overdue.length, 0)), tone: 'red' })}
        ${statCard({ label: 'Sedang dikerjakan', value: number(rows.reduce((s, r) => s + r.progress.length, 0)), tone: 'amber' })}
      </div>`;
      body.innerHTML = tab === 'preview' ? previewCards(rows, cloud) : logTable();
      body.querySelectorAll('[data-open]').forEach((li) => li.addEventListener('click', () => openActivityForm({ id: li.dataset.open, onSaved: draw })));
      body.querySelectorAll('[data-copy]').forEach(
        (b) =>
          (b.onclick = async () => {
            const r = rows.find((x) => x.member.id === b.dataset.copy);
            try {
              await navigator.clipboard.writeText(`${reminder.subject(r)}\n\n${reminder.plainText(r)}`);
              toast('Teks reminder disalin');
            } catch {
              toast('Gagal menyalin', 'error');
            }
          })
      );
      body.querySelectorAll('[data-send]').forEach((b) => (b.onclick = () => send([b.dataset.send], b)));
    };

    async function send(memberIds, btn) {
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Mengirim…';
      try {
        const res = await reminder.send({ memberIds, date });
        toast(`Terkirim ${res.sent}, gagal ${res.failed}, dilewati ${res.skipped}`, res.failed ? 'error' : 'ok');
      } catch (err) {
        toast(err.message, 'error');
      }
      btn.disabled = false;
      btn.textContent = label;
      draw();
    }

    el.querySelector('[data-date]').addEventListener('change', (e) => ((date = e.target.value || today()), draw()));
    el.querySelector('[data-send-all]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const n = rows.filter((r) => !r.empty && r.member.email).length;
      if (!n) return toast('Tidak ada reminder untuk dikirim', 'error');
      if (await confirmDialog(`Kirim email reminder ke ${n} member untuk ${dateLabel(date)}?`, { okText: 'Kirim' })) send([], btn);
    });
    bindTabs(el.querySelector('.tabs'), (t) => ((tab = t), draw()));
    draw();
  },
};
