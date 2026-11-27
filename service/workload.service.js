/**
 * Workload Service — agregasi untuk Dashboard Workload:
 * per client, per tipe tiket, dan per tim / member.
 */
import * as store from './store.service.js';
import * as projects from './project.service.js';
import * as activities from './activity.service.js';
import * as members from './member.service.js';
import * as clients from './client.service.js';
import * as master from './master.service.js';
import { inRange, today, addDays } from './format.service.js';

const projectDate = (p) => p.date || p.createdAt?.slice(0, 10) || '';

/** Kelompokkan project → [{key, label, count, open, mandays, revenue, grossProfit, overdue}] */
function group(rows, keyOf, labelOf) {
  const map = new Map();
  rows.forEach((p) => {
    const key = keyOf(p) || '-';
    if (!map.has(key)) map.set(key, { key, label: labelOf(key), rows: [] });
    map.get(key).rows.push(p);
  });
  return [...map.values()].map((g) => ({ ...g, ...projects.summary(g.rows) })).sort((a, b) => b.count - a.count || b.mandays - a.mandays);
}

export function build({ from, to, clientId = '', type = '' }) {
  const rows = projects.list().filter((p) => inRange(projectDate(p), { from, to }) && (!clientId || p.clientId === clientId) && (!type || p.type === type));
  const projectIds = new Set(rows.map((p) => p.id));
  const acts = activities.list().filter((a) => (a.projectId ? projectIds.has(a.projectId) : !clientId && !type));

  const byClient = group(rows, (p) => p.clientId, (k) => clients.nameOf(k));
  const byType = group(rows, (p) => p.type, (k) => k);
  const byStatus = master.statuses().map((s) => ({ ...s, count: rows.filter((p) => p.status === s.name).length }));

  // Matriks client × tipe
  const types = [...new Set(rows.map((p) => p.type || '-'))].sort();
  const matrix = byClient.map((c) => ({ label: c.label, key: c.key, cells: types.map((t) => c.rows.filter((p) => (p.type || '-') === t).length), total: c.count }));

  // Beban tim: 2 minggu ke depan
  const window = { from: today(), to: addDays(today(), 13) };
  const memberRows = members.visible().map((m) => {
    const load = activities.memberLoad(m.id, window);
    const capacity = load.capacityDays * (Number(m.dailyHours) || 8);
    const mine = acts.filter((a) => a.memberId === m.id);
    const assigned = rows.filter((p) => (p.members || []).some((x) => x.memberId === m.id));
    return {
      member: m,
      ...load,
      capacity,
      utilization: capacity ? (load.plannedHours / capacity) * 100 : 0,
      activitiesInScope: mine.length,
      projects: assigned.length,
      assignedMandays: assigned.reduce((s, p) => s + (Number((p.members || []).find((x) => x.memberId === m.id)?.mandays) || 0), 0),
    };
  });

  const teamMap = new Map();
  memberRows.forEach((r) => {
    const key = r.member.team || 'Tanpa Tim';
    if (!teamMap.has(key)) teamMap.set(key, { team: key, members: 0, open: 0, overdue: 0, plannedHours: 0, capacity: 0, projects: new Set() });
    const t = teamMap.get(key);
    t.members += 1;
    t.open += r.open;
    t.overdue += r.overdue;
    t.plannedHours += r.plannedHours;
    t.capacity += r.capacity;
    rows.filter((p) => (p.members || []).some((x) => x.memberId === r.member.id)).forEach((p) => t.projects.add(p.id));
  });
  const byTeam = [...teamMap.values()]
    .map((t) => ({ ...t, projects: t.projects.size, utilization: t.capacity ? (t.plannedHours / t.capacity) * 100 : 0 }))
    .sort((a, b) => b.utilization - a.utilization);

  return {
    rows,
    summary: projects.summary(rows),
    activities: {
      total: acts.length,
      open: acts.filter((a) => a.status !== 'done').length,
      overdue: acts.filter((a) => activities.isOverdue(a)).length,
      today: acts.filter((a) => activities.isTargetOn(a, today())).length,
    },
    byClient,
    byType,
    byStatus,
    types,
    matrix,
    byTeam,
    members: memberRows.sort((a, b) => b.utilization - a.utilization),
    window,
    clientsCount: clients.list().length,
  };
}
