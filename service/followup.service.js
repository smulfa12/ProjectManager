/**
 * Follow-up Service — daftar pekerjaan yang perlu di-follow up oleh satu member
 * (tampil di Dashboard untuk user yang login).
 *
 * Project milik member = PIC MLPT-nya atau ada di Member Assignment, dan belum selesai:
 *   - SLA PRL lewat / sisa < 24 jam
 *   - lewat target / target ≤ 7 hari lagi
 *   - status menunggu pihak lain (Waiting / Submitted / Pending) → perlu FU ke bank
 *   - belum ada update ≥ 7 hari
 * Activity milik member yang belum selesai: terlambat / target hari ini.
 */
import * as projects from './project.service.js';
import * as activities from './activity.service.js';
import * as clients from './client.service.js';
import * as master from './master.service.js';
import * as sla from './sla.service.js';
import { today, diffDays } from './format.service.js';

const STALE_DAYS = 7;
const SOON_DAYS = 7;

const isMine = (p, m) =>
  (p.picMlpt && p.picMlpt.trim().toLowerCase() === m.name.trim().toLowerCase()) || (p.members || []).some((x) => x.memberId === m.id);

/** Hari sejak update terakhir (catatan / perubahan); tanpa update → sejak dibuat. */
function daysSinceUpdate(p) {
  const last = projects.history(p.id).find((h) => h.action !== 'create');
  const from = (last?.createdAt || p.createdAt || '').slice(0, 10);
  return from ? diffDays(from, today()) : 0;
}

/**
 * Item follow up: { kind, id, href, code, title, client, reasons:[{text, tone}], severity }
 * severity kecil = lebih mendesak.
 */
export function forMember(m) {
  if (!m) return [];
  const t = today();
  const out = [];

  projects
    .list()
    .filter((p) => !master.isClosed(p.status) && isMine(p, m))
    .forEach((p) => {
      const reasons = [];
      let sev = 9;
      const add = (text, tone, s) => {
        reasons.push({ text, tone });
        sev = Math.min(sev, s);
      };
      if (sla.applies(p) && p.slaTempDue) {
        const st = sla.status(p);
        [['temp', 'Sementara'], ['perm', 'Permanen']].forEach(([k, label]) => {
          if (st[k].key === 'overdue') add(`SLA ${label} lewat`, 'red', 0);
          else if (st[k].key === 'open' && st[k].hours < 24) add(`SLA ${label} ${st[k].label.toLowerCase()}`, 'amber', 1);
        });
      }
      if (p.target) {
        const d = diffDays(t, p.target);
        if (d < 0) add(`Lewat target ${-d} hari`, 'red', 1);
        else if (d <= SOON_DAYS) add(d === 0 ? 'Target hari ini' : `Target ${d} hari lagi`, 'amber', 2);
      }
      if (/waiting|submitted|pending/i.test(p.status || '')) add(`${p.status} — FU ke ${clients.get(p.clientId)?.code || 'client'}`, 'purple', 3);
      const stale = daysSinceUpdate(p);
      if (stale >= STALE_DAYS) add(`Belum ada update ${stale} hari`, 'gray', 4);
      if (reasons.length)
        out.push({ kind: 'project', id: p.id, href: `#/project/detail?id=${p.id}&tab=history`, code: p.code, jira: p.jiraNo, target: p.target, title: p.title || p.outstanding || '-', client: clients.nameOf(p.clientId), status: p.status, reasons, severity: sev });
    });

  activities
    .list()
    .filter((a) => a.memberId === m.id && a.status !== 'done' && !a.id.startsWith('sla-')) // SLA sudah tercakup di baris project
    .forEach((a) => {
      if (!a.planEnd) return;
      const d = diffDays(t, a.planEnd);
      const p = projects.get(a.projectId);
      const base = { kind: 'activity', id: a.id, href: '#/activity?view=table', code: p?.code || 'Internal', jira: p?.jiraNo || '', target: a.planEnd, title: a.title, client: p ? clients.nameOf(p.clientId) : '-', status: master.activityStatus(a.status).label };
      if (d < 0) out.push({ ...base, reasons: [{ text: `Activity terlambat ${-d} hari`, tone: 'red' }], severity: 1 });
      else if (d === 0) out.push({ ...base, reasons: [{ text: 'Activity target hari ini', tone: 'amber' }], severity: 2 });
    });

  return out.sort((a, b) => a.severity - b.severity || a.client.localeCompare(b.client) || a.code.localeCompare(b.code));
}
