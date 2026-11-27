/**
 * Menu 4 — List Activity Member
 * Timeline Target vs Timeline Realtime dalam bentuk Gantt chart & Kanban board,
 * plus tabel rekap per activity.
 */
import * as activities from '../../service/activity.service.js';
import * as projects from '../../service/project.service.js';
import * as clients from '../../service/client.service.js';
import * as members from '../../service/member.service.js';
import * as master from '../../service/master.service.js';
import * as auth from '../../service/auth.service.js';
import { esc, pageHeader, tabs, bindTabs, options, emptyState, badge, progressBar, attempt, statCard } from '../../service/ui.service.js';
import { dateLabel, today, number } from '../../service/format.service.js';
import { ganttChart, autoRange } from '../shared/gantt.js';
import { kanbanBoard } from '../shared/kanban.js';
import { openActivityForm } from './activity-form.js';

const VIEW_KEY = 'pm.activity.view';

const projectLabel = (a) => {
  const p = projects.get(a.projectId);
  return p ? `${p.code} · ${clients.nameOf(p.clientId)}` : 'Internal';
};

function filtered(f) {
  const t = today();
  return activities.list().filter((a) => {
    if (f.memberId && a.memberId !== f.memberId) return false;
    if (f.projectId && a.projectId !== f.projectId) return false;
    if (f.clientId && projects.get(a.projectId)?.clientId !== f.clientId) return false;
    if (f.q && !`${a.title} ${a.description} ${projectLabel(a)}`.toLowerCase().includes(f.q.toLowerCase())) return false;
    if (f.scope === 'open' && a.status === 'done') return false;
    if (f.scope === 'today' && !activities.isTargetOn(a, t)) return false;
    if (f.scope === 'overdue' && !activities.isOverdue(a)) return false;
    return true;
  });
}

function groupsOf(items, by) {
  const map = new Map();
  items.forEach((a) => {
    const key = by === 'project' ? a.projectId || '' : a.memberId || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  });
  return [...map.entries()]
    .map(([key, list]) => {
      if (by === 'project') {
        const p = projects.get(key);
        return { label: p ? `${p.code} ${p.title || ''}` : 'Internal / tanpa project', sub: p ? clients.nameOf(p.clientId) : '', icon: '<span class="group-icon">📁</span>', items: list };
      }
      const m = members.get(key);
      return { label: m?.name || 'Belum di-assign', sub: m?.team || '', icon: members.avatar(m, 26), items: list };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function table(items) {
  return `
    <div class="table-wrap">
      <table class="table table--hover">
        <thead><tr>
          <th>Activity</th><th>Project</th><th>Member</th>
          <th>Target Mulai</th><th>Target Selesai</th><th>Aktual Mulai</th><th>Aktual Selesai</th>
          <th class="num">Jam</th><th>Progress</th><th>Status</th><th class="num">Deviasi</th>
        </tr></thead>
        <tbody>
          ${items
            .map((a) => {
              const st = master.activityStatus(a.status);
              const s = activities.slip(a);
              return `
              <tr data-open="${esc(a.id)}">
                <td><b>${esc(a.title)}</b> ${badge(master.priorityOf(a.priority).label, master.priorityOf(a.priority).tone)}</td>
                <td class="small">${esc(projectLabel(a))}</td>
                <td>${esc(members.nameOf(a.memberId))}</td>
                <td>${dateLabel(a.planStart)}</td><td>${dateLabel(a.planEnd)}</td>
                <td>${dateLabel(a.actualStart)}</td><td>${dateLabel(a.actualEnd)}</td>
                <td class="num">${number(a.planHours)}</td>
                <td style="min-width:110px"><div class="util">${progressBar(a.progress, a.status === 'done' ? 'green' : 'blue')}<span>${a.progress || 0}%</span></div></td>
                <td>${badge(st.label, st.tone)}</td>
                <td class="num ${s > 0 ? 'text-red' : 'muted'}">${s > 0 ? `+${s} hari` : '-'}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
}

export default {
  path: '/activity',
  title: 'Activity Member',
  render(el, params) {
    const me = auth.currentMember();
    let view = params.view || sessionStorage.getItem(VIEW_KEY) || 'gantt';
    const f = { memberId: params.member || '', projectId: params.project || '', clientId: '', q: '', scope: 'open', groupBy: 'member', zoom: 'day' };

    el.innerHTML = `
      ${pageHeader({ title: 'List Activity Member', subtitle: 'Timeline target vs realtime — Gantt chart & Kanban', icon: '🗓️', actions: '<button class="btn btn--primary" data-add>+ Activity</button>' })}
      <div data-stats></div>
      <div class="toolbar">
        ${tabs([['gantt', '📊 Gantt Chart'], ['kanban', '🗂️ Kanban'], ['table', '📋 Tabel']], view)}
        <div class="toolbar__right">
          <input class="input input--sm input--search" data-q placeholder="Cari activity…" />
          <select class="input input--sm" data-f="memberId">${options(members.list({ includeInactive: false }), f.memberId, { valueKey: 'id', labelKey: 'name', empty: 'Semua member' })}</select>
          <select class="input input--sm" data-f="clientId">${options(clients.list(), '', { valueKey: 'id', labelKey: 'name', empty: 'Semua client' })}</select>
          <select class="input input--sm" data-f="projectId">${options(projects.list(), f.projectId, { valueKey: 'id', labelKey: (p) => `${p.code} ${p.title || ''}`, empty: 'Semua project' })}</select>
        </div>
      </div>
      <div class="toolbar">
        <div class="chips" data-scope>
          ${[['open', 'Belum selesai'], ['today', 'Target hari ini'], ['overdue', 'Terlambat'], ['all', 'Semua']].map(([k, l]) => `<button class="chip ${k === f.scope ? 'chip--on' : ''}" data-s="${k}">${l}</button>`).join('')}
          ${me ? `<button class="chip" data-mine>👤 Activity saya</button>` : ''}
        </div>
        <div class="toolbar__right" data-gantt-opts>
          <label class="small muted">Kelompok</label>
          <select class="input input--sm" data-f="groupBy">${options([{ k: 'member', l: 'Per member' }, { k: 'project', l: 'Per project' }], f.groupBy, { valueKey: 'k', labelKey: 'l' })}</select>
          <select class="input input--sm" data-f="zoom">${options([{ k: 'day', l: 'Harian' }, { k: 'week', l: 'Mingguan' }, { k: 'month', l: 'Bulanan' }], f.zoom, { valueKey: 'k', labelKey: 'l' })}</select>
        </div>
      </div>
      <div data-view></div>`;

    const box = el.querySelector('[data-view]');
    const statsEl = el.querySelector('[data-stats]');
    const open = (id) => openActivityForm({ id, onSaved: draw });

    function draw() {
      const items = filtered(f);
      const base = filtered({ ...f, scope: 'all' });
      statsEl.innerHTML = `<div class="stats stats--sm">
        ${statCard({ label: 'Activity', value: number(base.length), hint: `${base.filter((a) => a.status === 'done').length} selesai`, tone: 'blue' })}
        ${statCard({ label: 'In Progress', value: number(base.filter((a) => a.status === 'progress').length), tone: 'amber' })}
        ${statCard({ label: 'Target hari ini', value: number(base.filter((a) => activities.isTargetOn(a, today())).length), tone: 'purple' })}
        ${statCard({ label: 'Terlambat', value: number(base.filter((a) => activities.isOverdue(a)).length), tone: 'red' })}
      </div>`;
      el.querySelector('[data-gantt-opts]').classList.toggle('hidden', view !== 'gantt');

      if (!items.length && view !== 'kanban') {
        box.innerHTML = `<div class="card">${emptyState('🗓️', 'Tidak ada activity', 'Ubah filter atau tambah activity baru.')}</div>`;
        return;
      }
      if (view === 'gantt') {
        box.innerHTML = '<div class="card card--flush" data-g></div>';
        ganttChart(box.querySelector('[data-g]'), {
          groups: groupsOf(items, f.groupBy),
          ...autoRange(items),
          zoom: f.zoom,
          label: (a) => (f.groupBy === 'project' ? esc(members.nameOf(a.memberId)) : esc(projectLabel(a))),
          onOpen: open,
        });
      } else if (view === 'kanban') {
        // kanban selalu menampilkan semua status (filter "belum selesai" diabaikan)
        const kItems = f.scope === 'open' ? base : items;
        kanbanBoard(box, {
          items: kItems,
          meta: (a) => esc(projects.get(a.projectId)?.code || 'Internal'),
          onOpen: open,
          onMove: async (id, status) => {
            await attempt(() => activities.move(id, status), `Dipindah ke ${master.activityStatus(status).label}`);
            draw();
          },
        });
      } else {
        box.innerHTML = `<div class="card card--flush">${table(items)}</div>`;
        box.querySelectorAll('[data-open]').forEach((r) => r.addEventListener('click', () => open(r.dataset.open)));
      }
    }

    bindTabs(el.querySelector('.tabs'), (t) => {
      view = t;
      sessionStorage.setItem(VIEW_KEY, t);
      draw();
    });
    el.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => ((f[s.dataset.f] = s.value), draw())));
    el.querySelector('[data-q]').addEventListener('input', (e) => ((f.q = e.target.value), draw()));
    el.querySelectorAll('[data-s]').forEach((b) =>
      b.addEventListener('click', () => {
        f.scope = b.dataset.s;
        el.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('chip--on', x === b));
        draw();
      })
    );
    el.querySelector('[data-mine]')?.addEventListener('click', (e) => {
      const on = !e.target.classList.contains('chip--on');
      e.target.classList.toggle('chip--on', on);
      f.memberId = on ? me.id : '';
      el.querySelector('[data-f="memberId"]').value = f.memberId;
      draw();
    });
    el.querySelector('[data-add]').addEventListener('click', () => openActivityForm({ preset: { memberId: f.memberId || me?.id || '', projectId: f.projectId }, onSaved: draw }));
    draw();
  },
};
