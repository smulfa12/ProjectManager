/**
 * Setting 7.1 — User parameter: user / member tim & client yang di-handle.
 * Tampilan matriks User × Client (centang = user meng-handle client itu) + form member.
 */
import * as members from '../../service/member.service.js';
import * as clients from '../../service/client.service.js';
import * as master from '../../service/master.service.js';
import * as store from '../../service/store.service.js';
import { esc, openModal, options, toast, formData, confirmDialog, attempt, badge, emptyState } from '../../service/ui.service.js';

function openMemberForm({ id = '', onSaved } = {}) {
  const m = id ? members.get(id) : { role: 'member', dailyHours: 8, reminder: true, active: true, clientIds: [] };
  const allClients = clients.list();
  const modal = openModal({
    title: id ? `Edit User ${m.name}` : 'User Baru',
    wide: true,
    body: `
      <form class="form" data-form>
        <div class="form-grid">
          <label class="field span-2"><span>Nama *</span><input class="input" name="name" required value="${esc(m.name || '')}" /></label>
          <label class="field span-2"><span>Email (sama dengan akun login & tujuan reminder)</span><input class="input" type="email" name="email" value="${esc(m.email || '')}" /></label>
          <label class="field"><span>Tim</span><select class="input" name="team">${options(master.teams(), m.team, { empty: '-' })}</select></label>
          <label class="field"><span>Jabatan</span><input class="input" name="position" value="${esc(m.position || '')}" /></label>
          <label class="field"><span>Role</span><select class="input" name="role">${options(master.ROLES, m.role, { valueKey: 'key', labelKey: 'label' })}</select></label>
          <label class="field"><span>Jam kerja / hari</span><input class="input num" type="number" min="1" max="24" step="0.5" name="dailyHours" value="${esc(m.dailyHours || 8)}" /></label>
          <label class="field span-2 check"><input type="checkbox" name="reminder" ${m.reminder !== false ? 'checked' : ''} /> Terima email reminder harian</label>
          <label class="field span-2 check"><input type="checkbox" name="active" ${m.active !== false ? 'checked' : ''} /> User aktif</label>
        </div>
        <fieldset>
          <legend>Client yang di-handle</legend>
          <p class="muted small">Admin otomatis bisa melihat semua client. User lain hanya melihat project / activity milik client yang dicentang.</p>
          <div class="check-grid">
            ${allClients.map((c) => `<label class="check"><input type="checkbox" name="clientIds" value="${esc(c.id)}" ${(m.clientIds || []).includes(c.id) ? 'checked' : ''} /> <span class="badge tone-gray">${esc(c.code)}</span> ${esc(c.name)}</label>`).join('') || '<p class="muted small">Belum ada client.</p>'}
          </div>
          <div class="row gap-sm"><button type="button" class="btn btn--ghost btn--sm" data-all>Centang semua</button><button type="button" class="btn btn--ghost btn--sm" data-none>Kosongkan</button></div>
        </fieldset>
        <div class="form-actions">
          ${id ? '<button type="button" class="btn btn--danger-ghost mr-auto" data-del>Hapus</button>' : ''}
          <button type="button" class="btn btn--ghost" data-cancel>Batal</button>
          <button class="btn btn--primary" type="submit">Simpan</button>
        </div>
      </form>`,
  });
  const form = modal.el.querySelector('[data-form]');
  form.querySelector('[data-cancel]').onclick = modal.close;
  form.querySelector('[data-all]').onclick = () => form.querySelectorAll('[name=clientIds]').forEach((c) => (c.checked = true));
  form.querySelector('[data-none]').onclick = () => form.querySelectorAll('[name=clientIds]').forEach((c) => (c.checked = false));
  form.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Hapus user ${m.name}?`, { okText: 'Hapus', danger: true }))) return;
    if (await attempt(() => members.remove(id).then(() => true), 'User dihapus')) {
      modal.close();
      onSaved?.();
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = formData(form);
    const input = { ...v, clientIds: [...form.querySelectorAll('[name=clientIds]:checked')].map((c) => c.value), reminder: form.reminder.checked, active: form.active.checked };
    try {
      await members.save(id, input);
      toast('User disimpan');
      modal.close();
      onSaved?.();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

export function renderUsers(el) {
  const draw = () => {
    const list = members.list();
    const allClients = clients.list();
    const roleLabel = (k) => master.ROLES.find((r) => r.key === k)?.label || k;
    el.innerHTML = `
      <section class="card">
        <div class="card__head">
          <h3>👥 User & Client yang di-handle</h3>
          <button class="btn btn--primary btn--sm" data-new>+ User</button>
        </div>
        ${store.mode() === 'cloud' && !list.some((m) => m.role === 'admin' && m.active !== false) ? '<div class="alert alert--warn">⚠️ Belum ada user ber-role <b>Admin</b>. Selama itu semua akun yang login dianggap admin. Tambahkan diri Anda sebagai Admin (email sama dengan akun login).</div>' : ''}
        ${list.length ? `
        <div class="table-wrap">
          <table class="table matrix">
            <thead><tr>
              <th>User</th><th>Tim</th><th>Role</th><th class="center">Reminder</th>
              ${allClients.map((c) => `<th class="center" title="${esc(c.name)}">${esc(c.code)}</th>`).join('')}
              <th></th>
            </tr></thead>
            <tbody>
              ${list
                .map(
                  (m) => `
                <tr class="${m.active === false ? 'is-inactive' : ''}">
                  <td><div class="row gap-sm">${members.avatar(m, 28)}<div><b>${esc(m.name)}</b><div class="muted small">${esc(m.email || '-')}</div></div></div></td>
                  <td>${esc(m.team || '-')}</td>
                  <td>${badge(roleLabel(m.role), m.role === 'admin' ? 'red' : m.role === 'pm' ? 'purple' : 'gray')}${m.active === false ? ' ' + badge('Nonaktif', 'gray') : ''}</td>
                  <td class="center">${m.reminder !== false ? '✉️' : '—'}</td>
                  ${allClients
                    .map((c) =>
                      m.role === 'admin'
                        ? '<td class="center muted" title="Admin: semua client">●</td>'
                        : `<td class="center"><input type="checkbox" data-m="${esc(m.id)}" data-c="${esc(c.id)}" ${(m.clientIds || []).includes(c.id) ? 'checked' : ''} /></td>`
                    )
                    .join('')}
                  <td class="actions"><button class="btn btn--icon btn--ghost btn--sm" data-edit="${esc(m.id)}">✏️</button></td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
        <div class="form-actions"><span class="muted small mr-auto">Centang = user meng-handle client tersebut. ● = admin (semua client).</span><button class="btn btn--primary" data-save-matrix>Simpan parameter client</button></div>`
        : emptyState('👥', 'Belum ada user', 'Tambahkan user / member tim beserta client yang di-handle.')}
      </section>
      <p class="muted small">Akun login dibuat di Supabase → Authentication → Users. Email akun harus sama dengan email user di sini.</p>`;

    el.querySelector('[data-new]').onclick = () => openMemberForm({ onSaved: draw });
    el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => openMemberForm({ id: b.dataset.edit, onSaved: draw })));
    el.querySelector('[data-save-matrix]')?.addEventListener('click', async () => {
      const next = new Map();
      el.querySelectorAll('[data-m]').forEach((cb) => {
        if (!next.has(cb.dataset.m)) next.set(cb.dataset.m, []);
        if (cb.checked) next.get(cb.dataset.m).push(cb.dataset.c);
      });
      const changed = [...next.entries()].filter(([id, ids]) => {
        const before = [...(members.get(id).clientIds || [])].sort().join();
        return before !== [...ids].sort().join();
      });
      if (!changed.length) return toast('Tidak ada perubahan');
      await attempt(() => Promise.all(changed.map(([id, clientIds]) => store.update('members', id, { clientIds }))), `Parameter ${changed.length} user disimpan`);
      draw();
    });
  };
  draw();
}
