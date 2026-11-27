/**
 * Kanban Board — kolom To Do / In Progress / Review / Done.
 * Kartu bisa di-drag ke kolom lain (status & tanggal realtime ikut terupdate).
 *
 * kanbanBoard(el, { items, onMove(id, status), onOpen(id), meta(a) })
 */
import * as master from '../../service/master.service.js';
import * as members from '../../service/member.service.js';
import { esc, badge, progressBar } from '../../service/ui.service.js';
import { dateLabel, daysUntil } from '../../service/format.service.js';

function card(a, meta) {
  const pr = master.priorityOf(a.priority);
  const d = daysUntil(a.planEnd);
  const late = a.status !== 'done' && d !== null && d < 0;
  const due = a.planEnd ? (late ? `<span class="text-red">⚠ ${-d} hari terlambat</span>` : a.status === 'done' ? `✓ ${dateLabel(a.actualEnd)}` : d === 0 ? '<span class="text-amber">Hari ini</span>' : `Target ${dateLabel(a.planEnd)}`) : '';
  return `
    <article class="kcard ${late ? 'kcard--late' : ''}" draggable="true" data-id="${esc(a.id)}">
      <div class="kcard__top">${badge(pr.label, pr.tone)}<span class="muted small">${meta ? meta(a) : ''}</span></div>
      <h4>${esc(a.title)}</h4>
      ${!['todo', 'backlog'].includes(a.status) ? progressBar(a.progress, a.status === 'done' ? 'green' : 'blue') : ''}
      <div class="kcard__foot">
        ${members.avatar(members.get(a.memberId), 24)}
        <span class="small">${due}</span>
      </div>
    </article>`;
}

export function kanbanBoard(el, { items, onMove, onOpen, meta }) {
  el.innerHTML = `
    <div class="kanban">
      ${master.ACTIVITY_STATUS.map((s) => {
        const list = items.filter((a) => a.status === s.key);
        return `
        <section class="kcol tone-${s.tone}" data-col="${s.key}">
          <header><span class="dot tone-${s.tone}"></span>${s.label}<span class="kcol__count">${list.length}</span></header>
          <div class="kcol__list" data-drop="${s.key}">
            ${list.map((a) => card(a, meta)).join('') || '<p class="kcol__empty">Tarik kartu ke sini</p>'}
          </div>
        </section>`;
      }).join('')}
    </div>`;

  let dragId = null;
  el.querySelectorAll('.kcard').forEach((c) => {
    c.addEventListener('dragstart', (e) => {
      dragId = c.dataset.id;
      c.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    c.addEventListener('dragend', () => c.classList.remove('dragging'));
    c.addEventListener('click', () => onOpen?.(c.dataset.id));
  });
  el.querySelectorAll('[data-drop]').forEach((zone) => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('is-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('is-over');
      const id = e.dataTransfer.getData('text/plain') || dragId;
      if (id) onMove?.(id, zone.dataset.drop);
    });
  });
}
