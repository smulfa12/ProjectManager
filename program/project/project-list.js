/**
 * Menu 3 — List Project
 * Daftar project + tambah / edit / hapus. Klik Uniq ID untuk detail
 * (Data Project, Timeline, Member Assignment, History Update).
 */
import * as projects from '../../service/project.service.js';
import * as clients from '../../service/client.service.js';
import * as master from '../../service/master.service.js';
import * as auth from '../../service/auth.service.js';
import { downloadCSV } from '../../service/export.service.js';
import { esc, pageHeader, options, emptyState, confirmDialog, attempt } from '../../service/ui.service.js';
import { today } from '../../service/format.service.js';
import { projectTable, bindSort, csvColumns, sortRows } from '../shared/project-table.js';
import { openProjectForm, rememberOrder } from './project-form.js';

export default {
  path: '/project',
  title: 'List Project',
  render(el, params) {
    const state = { q: params.q || '', clientId: params.client || '', status: params.status || '_open', costType: params.cost || '', sortKey: 'date', sortDir: -1 };
    const canCreate = clients.list({ includeInactive: false }).length > 0;

    el.innerHTML = `
      ${pageHeader({
        title: 'List Project',
        subtitle: 'Data project, timeline, member assignment & history update',
        icon: '📁',
        actions: `<button class="btn btn--ghost" data-export>⬇ Export</button><button class="btn btn--primary" data-new ${canCreate ? '' : 'disabled title="Belum ada client"'}>+ Project Baru</button>`,
      })}
      <div class="toolbar">
        <input class="input input--search" data-q placeholder="Cari project…" value="${esc(state.q)}" />
        <select class="input input--sm" data-client>${options(clients.list(), state.clientId, { valueKey: 'id', labelKey: 'name', empty: 'Semua client' })}</select>
        <select class="input input--sm" data-cost>${options(master.COST_TYPES, state.costType, { empty: 'Semua kategori biaya' })}</select>
        <div class="chips" data-status>
          ${[['_open', 'Belum selesai'], ['', 'Semua'], ...master.statusNames().map((s) => [s, s])]
            .map(([k, l]) => `<button class="chip ${k === state.status ? 'chip--on' : ''}" data-s="${esc(k)}">${esc(l)}</button>`)
            .join('')}
        </div>
      </div>
      <div data-list></div>`;

    const listEl = el.querySelector('[data-list]');
    let rows = [];

    const draw = () => {
      rows = projects
        .list()
        .filter((p) => projects.matches(p, state.q))
        .filter((p) => !state.clientId || p.clientId === state.clientId)
        .filter((p) => !state.costType || p.costType === state.costType)
        .filter((p) => (state.status === '_open' ? !master.isClosed(p.status) : !state.status || p.status === state.status));

      const order = sortRows(rows, state.sortKey, state.sortDir).map((p) => p.id);
      rememberOrder(order);
      listEl.innerHTML = rows.length
        ? `<div class="card card--flush">${projectTable(rows, {
            sortKey: state.sortKey,
            sortDir: state.sortDir,
            actions: (p) => `
              <button class="btn btn--icon btn--ghost btn--sm" data-edit="${esc(p.id)}" title="Edit">✏️</button>
              ${auth.isAdmin() ? `<button class="btn btn--icon btn--ghost btn--sm" data-del="${esc(p.id)}" title="Hapus">🗑️</button>` : ''}`,
          })}</div>
          <p class="muted small">${rows.length} project · klik judul kolom untuk mengurutkan</p>`
        : emptyState('📁', 'Belum ada project', canCreate ? 'Klik "+ Project Baru" untuk menambah.' : 'Tambahkan client dulu di menu Monitoring Client.');

      bindSort(listEl, state, draw);
      listEl.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => openProjectForm({ id: b.dataset.edit, onSaved: draw, ids: order })));
      listEl.querySelectorAll('[data-del]').forEach(
        (b) =>
          (b.onclick = async () => {
            const p = projects.get(b.dataset.del);
            if (!(await confirmDialog(`Hapus project ${p.code}? Activity & history project ini ikut terhapus.`, { okText: 'Hapus', danger: true }))) return;
            await attempt(() => projects.remove(p.id), 'Project dihapus');
            draw();
          })
      );
    };

    el.querySelector('[data-q]').addEventListener('input', (e) => ((state.q = e.target.value), draw()));
    el.querySelector('[data-client]').addEventListener('change', (e) => ((state.clientId = e.target.value), draw()));
    el.querySelector('[data-cost]').addEventListener('change', (e) => ((state.costType = e.target.value), draw()));
    el.querySelectorAll('[data-s]').forEach((b) =>
      b.addEventListener('click', () => {
        state.status = b.dataset.s;
        el.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('chip--on', x === b));
        draw();
      })
    );
    el.querySelector('[data-new]').addEventListener('click', () => openProjectForm({ preset: { clientId: state.clientId }, onSaved: (p) => (location.hash = `#/project/detail?id=${p.id}`) }));
    el.querySelector('[data-export]').addEventListener('click', () => downloadCSV(`list-project-${today()}.csv`, csvColumns(), rows));
    draw();
  },
};
