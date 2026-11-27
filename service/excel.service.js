/**
 * Excel Service — membuat file .xlsx di browser (library SheetJS, dimuat dari CDN saat dibutuhkan).
 *
 *   const wb = await excel.workbook();
 *   excel.addSheet(wb, 'Nama Sheet', rows, { title: ['Judul', 'Sub judul'] });
 *   excel.download(wb, 'laporan.xlsx');
 *
 * rows = array of object (kunci = judul kolom). Nilai Date → sel tanggal Excel.
 */
const SRC = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
let loading = null;

export function load() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SRC;
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => {
        loading = null;
        reject(new Error('Gagal memuat modul Excel — periksa koneksi internet'));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

let X = null;
export async function workbook() {
  X = await load();
  return X.utils.book_new();
}

/** Tanggal (YYYY-MM-DD) / waktu ISO → Date lokal (untuk sel tanggal Excel). */
export function toDate(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d;
}

/**
 * Tambah sheet. opts.title = baris judul di atas tabel (array teks).
 * opts.widths = lebar kolom manual {judul: lebar}.
 * opts.only = daftar kolom yang ditampilkan (default semua).
 */
export function addSheet(wb, name, rows, opts = {}) {
  // sheet kosong tetap memakai judul kolom lengkap (kolom yang dipilih)
  let head = rows.length ? Object.keys(rows[0]) : opts.only || opts.columns || ['Data'];
  // hanya kolom yang dipilih user (urutan tetap sesuai laporan)
  if (opts.only) head = head.filter((h) => opts.only.includes(h));
  if (!head.length) head = [rows.length ? Object.keys(rows[0])[0] : 'Data'];
  const title = opts.title || [];
  const aoa = [...title.map((t) => [t]), ...(title.length ? [[]] : []), head, ...rows.map((r) => head.map((h) => (r[h] === undefined || r[h] === null ? '' : r[h])))];
  const ws = X.utils.aoa_to_sheet(aoa);
  const start = title.length ? title.length + 1 : 0; // baris header (0-based)

  // format sel tanggal: tanpa jam → dd/mm/yyyy, dengan jam → dd/mm/yyyy hh:mm
  aoa.forEach((row, r) =>
    row.forEach((v, c) => {
      if (!(v instanceof Date)) return;
      const cell = ws[X.utils.encode_cell({ r, c })];
      if (cell) cell.z = v.getHours() || v.getMinutes() ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy';
    })
  );
  // lebar kolom otomatis
  ws['!cols'] = head.map((h, c) => {
    if (opts.widths?.[h]) return { wch: opts.widths[h] };
    const len = Math.max(String(h).length, ...rows.slice(0, 500).map((r) => (r[h] instanceof Date ? 16 : String(r[h] ?? '').length)));
    return { wch: Math.min(Math.max(len + 2, 8), 60) };
  });
  // filter di baris header
  if (rows.length) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: start, c: 0 }, e: { r: start + rows.length, c: head.length - 1 } }) };
  X.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  return ws;
}

export function download(wb, filename) {
  X.writeFile(wb, filename, { compression: true });
}
