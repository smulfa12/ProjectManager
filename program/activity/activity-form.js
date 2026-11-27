/**
 * Form Activity (modal) — timeline target (rencana) & realtime (aktual),
 * progress, status, prioritas, dan member yang mengerjakan.
 */
import * as activities from '../../service/activity.service.js';
import * as projects from '../../service/project.service.js';
import * as members from '../../service/member.service.js';
import * as master from '../../service/master.service.js';
import { esc, openModal, options, toast, formData, confirmDialog } from '../../service/ui.service.js';
import { today, addDays, workDays } from '../../service/format.service.js';

export function openActivityForm({ id = '', preset = {}, onSaved } = {}) {
  const a = id ? activities.get(id) : { status: 'todo', priority: 'medium', progress: 0, planStart: today(), planEnd: addDays(today(), 2), ...preset };
  const projectList = projects.list();
  const memberOpts = (projectId) => {
    const p = projects.get(projectId);
    const list = p ? members.handlersOf(p.clientId) : members.list({ includeInactive: false });
    // pastikan member yang sedang terpilih tetap ada di daftar
    const current = a.memberId && !list.some((m) => m.id === a.memberId) ? [members.get(a.memberId)].filter(Boolean) : [];
    return options([...list, ...current], a.memberId, { valueKey: 'id', labelKey: (m) => `${m.name}${m.team ? ' · ' + m.team : ''}`, empty: '— Belum di-assign —' });
  };

  const modal = openModal({
    title: id ? 'Edit Activity' : 'Activity Baru',
    wide: true,
    body: `
      <form class="form" data-form>
        <div class="form-grid">
          <label class="field span-2"><span>Judul activity *</span><input class="input" name="title" required value="${esc(a.title || '')}" /></label>
          <label class="field"><span>Project</span><select class="input" name="projectId">${options(projectList, a.projectId, { valueKey: 'id', labelKey: (p) => `${p.code} — ${p.title || p.type}`, empty: 'Internal / tanpa project' })}</select></label>
          <label class="field"><span>Member</span><select class="input" name="memberId" data-member>${memberOpts(a.projectId)}</select></label>
          <label class="field span-4"><span>Deskripsi</span><textarea class="input" name="description" rows="2">${esc(a.description || '')}</textarea></label>
        </div>
        <fieldset>
          <legend>🎯 Timeline Target</legend>
          <div class="form-grid">
            <label class="field"><span>Mulai</span><input class="input" type="date" name="planStart" value="${esc(a.planStart || '')}" /></label>
            <label class="field"><span>Selesai</span><input class="input" type="date" name="planEnd" value="${esc(a.planEnd || '')}" /></label>
            <label class="field"><span>Estimasi jam</span><input class="input num" type="number" min="0" step="0.5" name="planHours" value="${esc(a.planHours || '')}" placeholder="auto: hari kerja × 8" /></label>
            <div class="field"><span>&nbsp;</span><p class="muted small" data-days></p></div>
          </div>
        </fieldset>
        <fieldset>
          <legend>⚡ Timeline Realtime</legend>
          <div class="form-grid">
            <label class="field"><span>Mulai aktual</span><input class="input" type="date" name="actualStart" value="${esc(a.actualStart || '')}" /></label>
            <label class="field"><span>Selesai aktual</span><input class="input" type="date" name="actualEnd" value="${esc(a.actualEnd || '')}" /></label>
            <label class="field"><span>Status</span><select class="input" name="status">${options(master.ACTIVITY_STATUS, a.status, { valueKey: 'key', labelKey: 'label' })}</select></label>
            <label class="field"><span>Prioritas</span><select class="input" name="priority">${options(master.PRIORITIES, a.priority, { valueKey: 'key', labelKey: 'label' })}</select></label>
            <label class="field span-4"><span>Progress: <b data-pct>${a.progress || 0}%</b></span><input type="range" min="0" max="100" step="5" name="progress" value="${a.progress || 0}" /></label>
          </div>
          <p class="muted small">Tanggal aktual terisi otomatis saat status berubah (In Progress → mulai, Done → selesai).</p>
        </fieldset>
        <div class="form-actions">
          ${id ? '<button type="button" class="btn btn--danger-ghost mr-auto" data-del>Hapus</button>' : ''}
          <button type="button" class="btn btn--ghost" data-cancel>Batal</button>
          <button class="btn btn--primary" type="submit">Simpan</button>
        </div>
      </form>`,
  });

  const form = modal.el.querySelector('[data-form]');
  const daysEl = form.querySelector('[data-days]');
  const showDays = () => {
    const n = workDays(form.planStart.value, form.planEnd.value);
    daysEl.textContent = n ? `${n} hari kerja` : '';
  };
  showDays();
  form.planStart.addEventListener('change', () => {
    if (form.planEnd.value && form.planEnd.value < form.planStart.value) form.planEnd.value = form.planStart.value;
    showDays();
  });
  form.planEnd.addEventListener('change', showDays);
  form.projectId.addEventListener('change', () => (form.memberId.innerHTML = memberOpts(form.projectId.value)));
  form.progress.addEventListener('input', () => (form.querySelector('[data-pct]').textContent = form.progress.value + '%'));
  form.status.addEventListener('change', () => {
    if (form.status.value === 'done') {
      form.progress.value = 100;
      form.querySelector('[data-pct]').textContent = '100%';
    }
  });
  form.querySelector('[data-cancel]').onclick = modal.close;

  form.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Hapus activity "${a.title}"?`, { okText: 'Hapus', danger: true }))) return;
    try {
      await activities.remove(id);
      toast('Activity dihapus');
      modal.close();
      onSaved?.();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = formData(form);
    if (!Number(v.planHours) && v.planStart && v.planEnd) v.planHours = workDays(v.planStart, v.planEnd) * 8;
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const saved = await activities.save(id, v);
      toast(id ? 'Activity diperbarui' : 'Activity ditambahkan');
      modal.close();
      onSaved?.(saved);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}
