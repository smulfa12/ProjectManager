/**
 * Detail Project — tab Data Project, Timeline, Member Assignment, History Update.
 */
import * as projects from '../../service/project.service.js';
import * as clients from '../../service/client.service.js';
import * as master from '../../service/master.service.js';
import * as activities from '../../service/activity.service.js';
import * as members from '../../service/member.service.js';
import { esc, pageHeader, tabs, bindTabs, badge, emptyState, options, toast, attempt, progressBar, openModal, confirmDialog } from '../../service/ui.service.js';
import { rupiah, number, md, dateLabel, dateTimeLabel, daysUntil, diffDays, today } from '../../service/format.service.js';
import { openProjectForm } from './project-form.js';
import { jiraLink, priorityBadge } from '../shared/project-table.js';
import * as sla from '../../service/sla.service.js';
import * as sdlc from '../../service/sdlc.service.js';
import { openActivityForm } from '../activity/activity-form.js';
import { ganttChart, autoRange } from '../shared/gantt.js';

const TABS = [
  ['data', '📄 Data Project'],
  ['timeline', '🗓️ Timeline'],
  ['members', '👥 Member Assignment'],
  ['history', '🕘 History Update'],
];

const dl = (rows) => `<dl class="dl">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v || '<span class="muted">-</span>'}</dd>`).join('')}</dl>`;

/* ---------- Tab: Data Project ---------- */

function tabData(p) {
  const F = projects.FIELDS;
  const c = clients.get(p.clientId);
  const margin = p.revenue ? Math.round((p.grossProfit / p.revenue) * 100) : 0;
  return `
    <div class="grid grid--3">
      <section class="card">
        <h3>Identitas</h3>
        ${dl([
          [F.code, `<b>${esc(p.code)}</b>`],
          [F.systemId, esc(p.systemId)],
          [F.title, esc(p.title)],
          [F.type, esc(p.type)],
          [F.clientId, c ? `<a href="#/client/detail?id=${esc(c.id)}">${esc(c.code)} — ${esc(c.name)}</a>` : '-'],
          [F.module, esc(p.module)],
          [F.jiraNo, jiraLink(p)],
          [F.crNo, esc(p.crNo)],
          [F.date, dateLabel(p.date)],
        ])}
      </section>
      <section class="card">
        <h3>Biaya</h3>
        ${master.isNoCost(p.type) ? `<p class="muted small">Tipe ${esc(p.type)} tidak memerlukan Mandays, Price TCV, Revenue, Gross Profit & BAST.</p>` : ''}
        ${master.isNoCost(p.type) ? '' : dl([
          [F.costType, p.costType ? badge(p.costType, master.costTone(p.costType)) : ''],
          [F.mandays, md(p.mandays)],
          [F.priceTcv, rupiah(p.priceTcv)],
          [F.revenue, rupiah(p.revenue)],
          [F.grossProfit, `<span class="${p.grossProfit < 0 ? 'text-red' : 'text-green'}">${rupiah(p.grossProfit)}</span>${p.revenue ? ` <small class="muted">(${margin}%)</small>` : ''}`],
          ['Harga client / MD', rupiah(c?.pricePerMandays)],
        ])}
      </section>
      <section class="card">
        <h3>PIC & Status</h3>
        ${dl([
          [F.status, badge(p.status || '-', master.statusOf(p.status).tone)],
          [F.picBank, esc(p.picBank)],
          [F.picMlpt, esc(p.picMlpt)],
          [F.target, p.target ? `${dateLabel(p.target)}${!master.isClosed(p.status) && daysUntil(p.target) < 0 ? ' <span class="badge tone-red">lewat target</span>' : ''}` : ''],
          [F.bast, esc(p.bast)],
          [F.bastDate, p.bastDate ? dateLabel(p.bastDate) : ''],
        ])}
      </section>
    </div>
    ${sla.applies(p) ? (() => {
      const st = sla.status(p);
      const r = p.priority ? sla.rule(p.clientId, p.priority) : null;
      const row = (label, due, done, s, rr) => `<tr><td><b>${label}</b></td><td>${rr ? sla.ruleLabel(rr) : '-'}</td><td>${due ? dateTimeLabel(due) : '-'}</td><td>${done ? dateTimeLabel(done) : '-'}</td><td>${badge(s.label, s.tone)}</td></tr>`;
      return `
    <section class="card">
      <div class="card__head"><h3>🚨 Prioritas & SLA</h3><span>${priorityBadge(p)} <span class="muted small">lapor ${p.reportedAt ? dateTimeLabel(p.reportedAt) : '-'}</span></span></div>
      ${p.priority ? `<table class="table table--compact">
        <thead><tr><th>SLA</th><th>Ketentuan</th><th>Batas</th><th>Selesai</th><th>Status</th></tr></thead>
        <tbody>${row('Solusi Sementara', p.slaTempDue, p.tempDoneAt, st.temp, r?.temp)}${row('Solusi Permanen', p.slaPermDue, p.permDoneAt, st.perm, r?.perm)}</tbody>
      </table>` : '<p class="muted small">Prioritas belum diisi — edit project untuk menghitung SLA.</p>'}
    </section>`;
    })() : ''}
    <section class="card">
      ${dl([
        [F.outstanding, esc(p.outstanding)],
        [F.remark, esc(p.remark)],
        [F.notes, esc(p.notes).replace(/\n/g, '<br>')],
        ['Dibuat', `${dateTimeLabel(p.createdAt)} ${p.createdBy ? 'oleh ' + esc(p.createdBy) : ''}`],
        ['Update terakhir', dateTimeLabel(p.updatedAt)],
      ])}
    </section>`;
}

/* ---------- Tab: Timeline ---------- */

function milestones(p) {
  const points = [
    ['Date', p.date],
    ['Start', p.startDate],
    ['Target', p.target],
    ['Selesai', p.endDate],
    ['BAST', p.bastDate],
  ].filter(([, d]) => d);
  if (points.length < 2) return '<p class="muted small">Isi tanggal Start & Target project untuk melihat milestone.</p>';
  const all = [...points.map(([, d]) => d), today()].sort();
  const from = all[0];
  const span = Math.max(diffDays(from, all[all.length - 1]), 1);
  const pos = (d) => (diffDays(from, d) / span) * 100;
  const planned = p.startDate && p.target ? `<div class="ms__plan" style="left:${pos(p.startDate)}%;width:${pos(p.target) - pos(p.startDate)}%"></div>` : '';
  return `
    <div class="ms">
      <div class="ms__line"></div>
      ${planned}
      <div class="ms__today" style="left:${pos(today())}%"><span>Hari ini</span></div>
      ${points.map(([l, d], i) => `<div class="ms__point ${i % 2 ? 'ms__point--down' : ''}" style="left:${pos(d)}%"><i></i><b>${l}</b><small>${dateLabel(d)}</small></div>`).join('')}
    </div>`;
}

/** Kartu tahapan SDLC (CR / PRL) — stepper + tombol generate timeline. */
function sdlcCard(p) {
  const cat = sdlc.category(p);
  const meta = sdlc.CATEGORIES.find((c) => c.key === cat);
  const rows = sdlc.progress(p);
  const has = rows.some((r) => r.activity);
  const last = rows.filter((r) => r.activity).pop()?.activity;
  const lateEnd = has && p.target && last?.planEnd > p.target;
  const doneN = rows.filter((r) => r.done).length;
  return `
    <section class="card">
      <div class="card__head">
        <h3>${meta.icon} Tahapan SDLC ${esc(meta.label)} <span class="muted small">${has ? `${doneN}/${rows.length} step selesai` : `${rows.length} step`}</span></h3>
        <div class="row gap-sm">
          ${has
            ? `<button class="btn btn--ghost btn--sm" data-sdlc="sync" title="Tambah step baru / sesuaikan nama step tanpa mengubah jadwal">↻ Sinkron step</button>
               <button class="btn btn--ghost btn--sm" data-sdlc="reset" title="Hitung ulang semua tanggal rencana dari Start project">📅 Hitung ulang jadwal</button>`
            : '<button class="btn btn--primary btn--sm" data-sdlc="create">⚙️ Buat timeline SDLC</button>'}
        </div>
      </div>
      <ol class="sdlc-steps">
        ${rows
          .map((r) => {
            const a = r.activity;
            const st = r.done ? 'done' : r.late ? 'late' : r.current ? 'current' : a ? 'todo' : 'none';
            return `<li class="sdlc-step is-${st}" ${a ? `data-open-step="${esc(a.id)}"` : ''} title="${esc(r.team ? 'Tim ' + r.team : '')}">
              <span class="sdlc-step__no">${r.done ? '✓' : r.index}</span>
              <b>${esc(r.name)}</b>
              <small>${a ? `${dateLabel(a.planStart)} – ${dateLabel(a.planEnd)}` : `${r.days} hari kerja`}</small>
              ${a ? `<small>${r.done ? 'Selesai' : `${a.progress || 0}% · ${esc(members.nameOf(a.memberId))}`}</small>` : ''}
            </li>`;
          })
          .join('')}
      </ol>
      ${has ? '' : `<p class="muted small">Step diatur di menu Setting SDLC (berlaku umum). Timeline dibuat berurutan mulai ${p.startDate ? 'Start project' : cat === 'PRL' ? 'Waktu Lapor / Date' : 'Date project'}; tiap step jadi activity (Gantt, Kanban, reminder).</p>`}
      ${lateEnd ? `<p class="alert alert--warn small">⚠️ Step terakhir selesai ${dateLabel(last.planEnd)}, melewati Target project ${dateLabel(p.target)}.</p>` : ''}
    </section>`;
}

function tabTimeline(el, p, redraw) {
  const acts = activities.ofProject(p.id);
  const done = acts.filter((a) => a.status === 'done').length;
  const avg = acts.length ? Math.round(acts.reduce((s, a) => s + (Number(a.progress) || 0), 0) / acts.length) : 0;
  el.innerHTML = `
    <section class="card">
      <div class="card__head"><h3>Milestone Project</h3></div>
      ${milestones(p)}
    </section>
    ${sdlcCard(p)}
    <section class="card">
      <div class="card__head">
        <h3>Activity (${acts.length}) · ${done} selesai</h3>
        <div class="row gap-sm">
          <div class="util" style="width:180px">${progressBar(avg, avg === 100 ? 'green' : 'blue')}<span>${avg}%</span></div>
          <select class="input input--sm" data-zoom>${options([{ k: 'day', l: 'Harian' }, { k: 'week', l: 'Mingguan' }, { k: 'month', l: 'Bulanan' }], 'day', { valueKey: 'k', labelKey: 'l' })}</select>
          <button class="btn btn--primary btn--sm" data-add>+ Activity</button>
        </div>
      </div>
      <div data-gantt></div>
    </section>`;

  const draw = (zoom = 'day') => {
    const box = el.querySelector('[data-gantt]');
    if (!acts.length) {
      box.innerHTML = emptyState('🗓️', 'Belum ada activity', 'Tambahkan activity dan assign ke member.');
      return;
    }
    const byMember = new Map();
    acts.forEach((a) => {
      const k = a.memberId || '';
      if (!byMember.has(k)) byMember.set(k, []);
      byMember.get(k).push(a);
    });
    const groups = [...byMember.entries()].map(([mid, items]) => {
      const m = members.get(mid);
      return { label: m?.name || 'Belum di-assign', sub: m?.team || '', icon: members.avatar(m, 26), items };
    });
    const range = autoRange([...acts, { planStart: p.startDate, planEnd: p.target }]);
    ganttChart(box, { groups, ...range, zoom, label: (a) => master.activityStatus(a.status).label, onOpen: (id) => openActivityForm({ id, onSaved: redraw }) });
  };
  draw();
  el.querySelector('[data-zoom]').addEventListener('change', (e) => draw(e.target.value));
  el.querySelectorAll('[data-sdlc]').forEach((b) =>
    b.addEventListener('click', async () => {
      const mode = b.dataset.sdlc;
      if (mode === 'reset' && !(await confirmDialog('Hitung ulang semua tanggal rencana step SDLC dari Start project? Progress & realisasi tidak berubah.'))) return;
      const res = await attempt(() => sdlc.generate(projects.get(p.id), { reset: mode === 'reset' }));
      if (res) {
        toast(`Timeline SDLC: ${res.created} dibuat, ${res.updated} diperbarui${res.removed ? `, ${res.removed} dihapus` : ''}`);
        redraw();
      }
    })
  );
  el.querySelectorAll('[data-open-step]').forEach((li) => li.addEventListener('click', () => openActivityForm({ id: li.dataset.openStep, onSaved: redraw })));
  el.querySelector('[data-add]').addEventListener('click', () => openActivityForm({ preset: { projectId: p.id, planStart: p.startDate && p.startDate > today() ? p.startDate : today() }, onSaved: redraw }));
}

/* ---------- Tab: Member Assignment ---------- */

function tabMembers(el, p, redraw) {
  let rows = (p.members || []).map((m) => ({ ...m }));
  const candidates = () => members.handlersOf(p.clientId);

  const draw = () => {
    const total = rows.reduce((s, r) => s + (Number(r.mandays) || 0), 0);
    const acts = activities.ofProject(p.id);
    el.innerHTML = `
      <section class="card">
        <div class="card__head">
          <h3>Member Assignment</h3>
          <span class="muted small">Alokasi ${md(total)} dari ${md(p.mandays)} project ${total > p.mandays ? '<span class="badge tone-red">melebihi mandays</span>' : ''}</span>
        </div>
        <table class="table">
          <thead><tr><th>Member</th><th>Role di project</th><th class="num" style="width:140px">Mandays</th><th class="num">Activity</th><th class="num">Progress</th><th></th></tr></thead>
          <tbody>
            ${rows
              .map((r, i) => {
                const mine = acts.filter((a) => a.memberId === r.memberId);
                const avg = mine.length ? Math.round(mine.reduce((s, a) => s + (Number(a.progress) || 0), 0) / mine.length) : 0;
                const opts = [...candidates(), members.get(r.memberId)].filter((m, j, arr) => m && arr.findIndex((x) => x?.id === m.id) === j);
                return `
                <tr>
                  <td><select class="input input--sm" data-i="${i}" data-k="memberId">${options(opts, r.memberId, { valueKey: 'id', labelKey: (m) => `${m.name}${m.team ? ' · ' + m.team : ''}`, empty: 'Pilih member' })}</select></td>
                  <td><input class="input input--sm" data-i="${i}" data-k="role" value="${esc(r.role || '')}" placeholder="cth. Developer" /></td>
                  <td><input class="input input--sm num" type="number" min="0" step="0.5" data-i="${i}" data-k="mandays" value="${esc(r.mandays ?? '')}" /></td>
                  <td class="num">${mine.length}</td>
                  <td class="num">${mine.length ? avg + '%' : '-'}</td>
                  <td class="actions"><button class="btn btn--icon btn--ghost btn--sm" data-rm="${i}" title="Hapus">✕</button></td>
                </tr>`;
              })
              .join('') || '<tr><td colspan="6" class="muted center">Belum ada member di project ini.</td></tr>'}
          </tbody>
        </table>
        <div class="form-actions">
          <button class="btn btn--ghost mr-auto" data-add>+ Tambah member</button>
          <input class="input input--sm" data-note placeholder="Catatan (opsional, masuk History)" style="max-width:320px" />
          <button class="btn btn--primary" data-save>Simpan assignment</button>
        </div>
        <p class="muted small">Pilihan member = user yang meng-handle client ${esc(clients.nameOf(p.clientId))} (atur di Setting → User & Client).</p>
      </section>`;

    el.querySelectorAll('[data-k]').forEach((inp) =>
      inp.addEventListener('change', () => {
        const r = rows[inp.dataset.i];
        r[inp.dataset.k] = inp.dataset.k === 'mandays' ? Number(inp.value) || 0 : inp.value;
        if (inp.dataset.k !== 'role') draw();
      })
    );
    el.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => (rows.splice(Number(b.dataset.rm), 1), draw())));
    el.querySelector('[data-add]').onclick = () => {
      const used = new Set(rows.map((r) => r.memberId));
      const next = candidates().find((m) => !used.has(m.id));
      rows.push({ memberId: next?.id || '', role: next?.team || '', mandays: 0 });
      draw();
    };
    el.querySelector('[data-save]').onclick = async () => {
      const clean = rows.filter((r) => r.memberId);
      if (new Set(clean.map((r) => r.memberId)).size !== clean.length) return toast('Member yang sama dipilih dua kali', 'error');
      const ok = await attempt(() => projects.setMembers(p.id, clean, el.querySelector('[data-note]').value.trim()), 'Assignment disimpan');
      if (ok) redraw();
    };
  };
  draw();
}

/* ---------- Tab: History ---------- */

const ACTION = { create: ['Dibuat', 'green'], update: ['Update', 'blue'], status: ['Status', 'purple'], member: ['Member', 'teal'], note: ['Catatan', 'amber'] };

function tabHistory(el, p, redraw) {
  const list = projects.history(p.id);
  el.innerHTML = `
    <section class="card">
      <form class="form" data-note>
        <div class="row gap-sm history-add">
          <input class="input" type="date" name="date" value="${today()}" title="Tanggal update" />
          <input class="input grow" name="note" placeholder="Tulis update / catatan progress project… (cth. Waiting UAT)" required />
          <button class="btn btn--primary">Tambah update</button>
        </div>
        <label class="check small"><input type="checkbox" name="remark" checked /> Jadikan <b>Remark</b> project (update terbaru tampil di List Project)</label>
      </form>
    </section>
    <section class="card">
      ${list.length ? `<ol class="history">
        ${list
          .map((h) => {
            const [label, tone] = ACTION[h.action] || [h.action, 'gray'];
            const editable = projects.canEditHistory(h);
            return `
            <li>
              <div class="history__dot tone-${tone}"></div>
              <div class="history__body">
                <div class="history__meta">
                  ${badge(label, tone)} <b>${esc(h.byEmail || '-')}</b> <span class="muted">· ${dateTimeLabel(h.createdAt)}</span>
                  ${editable ? `<span class="history__actions">
                    <button class="btn btn--icon btn--ghost btn--sm" data-hedit="${esc(h.id)}" title="Edit">✏️</button>
                    <button class="btn btn--icon btn--ghost btn--sm" data-hdel="${esc(h.id)}" title="Hapus">🗑️</button>
                  </span>` : ''}
                </div>
                ${h.note ? `<p>${esc(h.note)}</p>` : ''}
                ${(h.changes || []).length ? `<ul class="changes">${h.changes.map((c) => `<li><b>${esc(c.label)}</b>: <del>${esc(c.from)}</del> → <ins>${esc(c.to)}</ins></li>`).join('')}</ul>` : ''}
              </div>
            </li>`;
          })
          .join('')}
      </ol>` : emptyState('🕘', 'Belum ada history')}
    </section>`;

  el.querySelector('[data-note]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const note = f.note.value.trim();
    if (!note) return;
    if (await attempt(() => projects.addNote(p.id, note, { date: f.date.value, updateRemark: f.remark.checked }).then(() => true), 'Update ditambahkan')) redraw();
  });

  el.querySelectorAll('[data-hedit]').forEach((b) =>
    b.addEventListener('click', () => {
      const h = list.find((x) => x.id === b.dataset.hedit);
      const modal = openModal({
        title: 'Edit History Update',
        body: `
          <form class="form" data-hform>
            <label class="field"><span>Tanggal</span><input class="input" type="date" name="date" value="${h.createdAt.slice(0, 10)}" /></label>
            <label class="field"><span>Catatan</span><textarea class="input" name="note" rows="4">${esc(h.note || '')}</textarea></label>
            ${(h.changes || []).length ? '<p class="muted small">Rincian perubahan field (otomatis) tidak bisa diubah, hanya catatannya.</p>' : ''}
            <div class="form-actions">
              <button type="button" class="btn btn--ghost" data-cancel>Batal</button>
              <button class="btn btn--primary">Simpan</button>
            </div>
          </form>`,
      });
      const form = modal.el.querySelector('[data-hform]');
      form.querySelector('[data-cancel]').onclick = modal.close;
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const ok = await attempt(() => projects.updateHistory(h.id, { note: form.note.value, date: form.date.value }).then(() => true), 'History diperbarui');
        if (ok) {
          modal.close();
          redraw();
        }
      });
    })
  );

  el.querySelectorAll('[data-hdel]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmDialog('Hapus history update ini?', { okText: 'Hapus', danger: true }))) return;
      if (await attempt(() => projects.removeHistory(b.dataset.hdel).then(() => true), 'History dihapus')) redraw();
    })
  );
}

/* ---------- Halaman ---------- */

export default {
  path: '/project/detail',
  title: 'Detail Project',
  render(el, params) {
    const p = projects.get(params.id);
    if (!p || !projects.list().some((x) => x.id === p.id)) {
      el.innerHTML = pageHeader({ title: 'Project tidak ditemukan', back: '#/project' }) + emptyState('📁', 'Project tidak ditemukan atau Anda tidak punya akses');
      return;
    }
    const tab = params.tab || 'data';
    const st = master.statusOf(p.status);
    el.innerHTML = `
      ${pageHeader({
        title: `${p.code}${p.title ? ' — ' + p.title : ''}`,
        subtitle: `${clients.nameOf(p.clientId)} · ${p.type || '-'} · ${number(p.mandays)} MD`,
        back: '#/project',
        actions: `
          <select class="input input--sm status-select tone-${st.tone}" data-status>${options(master.statusNames(), p.status)}</select>
          <button class="btn btn--primary" data-edit>✏️ Edit</button>`,
      })}
      ${tabs(TABS, tab)}
      <div data-tab-body></div>`;

    const body = el.querySelector('[data-tab-body]');
    let current = tab;
    // render ulang halaman (router) dengan tab yang sedang aktif
    const redraw = () => (location.hash = `#/project/detail?id=${p.id}&tab=${current}&r=${Date.now()}`);
    const show = (t) => {
      current = t;
      history.replaceState(null, '', `#/project/detail?id=${p.id}&tab=${t}`);
      const fresh = projects.get(p.id);
      if (t === 'data') body.innerHTML = tabData(fresh);
      if (t === 'timeline') tabTimeline(body, fresh, redraw);
      if (t === 'members') tabMembers(body, fresh, redraw);
      if (t === 'history') tabHistory(body, fresh, redraw);
    };
    bindTabs(el, show);
    show(tab);

    el.querySelector('[data-edit]').addEventListener('click', () => openProjectForm({ id: p.id, onSaved: (saved) => (saved.id === p.id ? redraw() : null) }));
    el.querySelector('[data-status]').addEventListener('change', async (e) => {
      const ok = await attempt(() => projects.save(p.id, { ...projects.get(p.id), status: e.target.value }), `Status → ${e.target.value}`);
      if (ok) redraw();
    });
  },
};
