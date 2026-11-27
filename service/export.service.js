/**
 * Export Service — unduh data tabel sebagai Excel (.xlsx) atau CSV.
 */
import * as excel from './excel.service.js';
export function toCSV(columns, rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => cell(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => cell(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(';'));
  return [head, ...body].join('\r\n');
}

export function downloadCSV(filename, columns, rows) {
  const blob = new Blob(['﻿' + toCSV(columns, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Unduh sebagai Excel (.xlsx). columns = [{label, value(row), type?: 'date'|'datetime'}]
 */
export async function downloadExcel(filename, sheetName, columns, rows, opts = {}) {
  const wb = await excel.workbook();
  const data = rows.map((r) =>
    Object.fromEntries(
      columns.map((c) => {
        const v = typeof c.value === 'function' ? c.value(r) : r[c.key];
        return [c.label, c.type ? excel.toDate(v) : v ?? ''];
      })
    )
  );
  excel.addSheet(wb, sheetName, data, { columns: columns.map((c) => c.label), only: columns.map((c) => c.label), ...opts });
  excel.download(wb, filename);
}
