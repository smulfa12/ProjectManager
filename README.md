# 📊 Project Manager — Workload, Project & Activity Tim

Aplikasi web untuk memantau **workload tim**, **data project**, **activity member** (Gantt & Kanban),
**monitoring client** (harga & free mandays), dan **reminder email harian**.
Database memakai **Supabase** (project `ProjectManager_`) dan kode dibuat **per modul**
(`app.js` hanya mendaftarkan menu).

## ✨ Menu

| # | Menu | Isi |
|---|------|-----|
| 1 | **Dashboard Workload** | **📌 Perlu Follow Up** untuk user yang login (SLA PRL lewat/hampir lewat, lewat target, target ≤ 7 hari, status menunggu bank, belum ada update ≥ 7 hari, activity terlambat / target hari ini). Statistik (project, mandays, TCV, revenue, gross profit — **termasuk maintenance fee** dari amortisasi kontrak, activity), workload **per Client**, **per Tipe Tiket**, matriks Client × Tipe, workload **per Tim** & per Member (utilisasi 2 minggu ke depan). Filter periode / client / tipe. |
| 2 | **Inquiry Project** | Cari project dengan filter lengkap (kata kunci, client, tipe, status, modul, cost/free MD, PIC, rentang Date & Target, BAST, lewat target, outstanding), ringkasan hasil, semua kolom Data Project, export CSV. |
| 3 | **List Project** | Daftar project + tambah/edit/hapus. Detail project berisi tab **Data Project**, **Timeline** (milestone + Gantt activity), **Member Assignment** (member, role, alokasi mandays), **History Update** (log otomatis setiap perubahan + catatan manual). |
| 3b | **Weekly Meeting** | Isi History Update cepat saat meeting mingguan: semua project (filter client / PIC MLPT / tipe / status) dalam satu tabel, ketik update → **Enter** = simpan & lanjut ke baris berikutnya, ubah status, PIC MLPT & Target langsung (Target hanya untuk status Requirement Gathering / Under Development / SIT In Progress — atur di Setting → Master Data), progres "x dari y sudah diupdate", dan **Salin notulen** per client. |
| 4 | **List Activity Member** | **Gantt chart** (Timeline Target vs Timeline Realtime, per member / per project, zoom harian/mingguan/bulanan), **Kanban** (drag & drop To Do → In Progress → Review → Done, tanggal aktual terisi otomatis), dan tabel deviasi. |
| 5 | **Monitoring Client** | Kartu monitoring per client (pemakaian free mandays, project open, revenue, belum BAST). **5.1 Setting Price per Client**, **5.2 Setting Free Mandays per Client**, dan **5.3 Maintenance & Amortisasi**: harga maintenance tahun berjalan, nilai kontrak (TCV), periode kontrak; pendapatan diakui merata sepanjang kontrak (edit langsung di tabel). |
| 5b | **History Trend** | Grafik pergerakan tiket **close** dari tahun ke tahun (dan per bulan) per tipe — CR, PRL (maintenance), dll — dengan metrik jumlah tiket / mandays / revenue, plus **pendapatan kontrak maintenance** (amortisasi). Tabel pertumbuhan per tahun. |
| 5d | **Setting SLA** | Menu khusus SLA per client untuk tiket PRL: edit SLA solusi sementara & permanen per prioritas (jam / hari kerja / hari kalender), terapkan ke semua client, kembali ke bawaan, plus ringkasan SLA semua client (klik baris untuk edit). Admin bisa mengubah; user lain hanya melihat client yang di-handle. |
| 5c | **Laporan** | Generate **Excel (.xlsx)**: (1) *Laporan Progress Project & PRL* — ringkasan per client, per status, detail Project & CR, detail PRL (prioritas & SLA), history update; (2) *Laporan SLA* — ringkasan per client × prioritas (tercapai / terlambat / lewat SLA / % tercapai) untuk solusi sementara & permanen, detail SLA per PRL, ketentuan SLA. Filter client, periode, status. **⚙️ Pilih kolom**: centang sheet & kolom yang ingin dimasukkan (tersimpan di browser). |
| 6 | **Reminder** (khusus Admin) | Preview reminder per member (target hari ini, terlambat, sedang dikerjakan), **kirim email sekarang**, draft email (mailto), log pengiriman. Otomatis tiap pagi lewat Supabase Edge Function + pg_cron. |
| 7 | **Setting** (admin) | **7.1 User parameter**: matriks User × Client (client apa saja yang di-handle tiap user), role, tim, jam kerja, penerima reminder. Master data (tipe tiket, status, modul, tim, frekuensi PM, biaya internal/MD, awalan Uniq ID), pengaturan reminder, data contoh. |

### Data Project
Uniq ID Project (otomatis `PRJ-YYMM-0001`), Project ID Sistem, Nama, Tipe, Client, No Jira, Modul, No CR Client,
Project Outstanding, Date, Cost/Free Mandays, Mandays, Price TCV, Revenue, Gross Profit, BAST (+ tanggal),
PIC Bank, PIC MLPT, Start, Target, Selesai Aktual, Status, Remark, Notes.

> **Perhitungan otomatis** (bisa diubah manual di form):
> Price TCV = Mandays × Price per Mandays client (Free Mandays → 0) · Revenue = Price TCV ·
> Gross Profit = Revenue − Mandays × biaya internal per mandays (Setting → Master Data).
> Tipe **PRL** (atur di Setting → Master Data) tidak memerlukan Mandays, Price TCV, Revenue, Gross Profit & BAST.
>
> **Maintenance client**: TCV kontrak = harga per tahun × lama kontrak (bulan) ÷ 12 (atau diisi manual);
> amortisasi = TCV ÷ total hari kontrak × hari kontrak dalam periode.

### PRL: Prioritas & SLA
- Tipe **PRL** punya **Prioritas** (Critical / High / Medium / Low — atur di Setting → Master Data) dan **Waktu Lapor**.
- SLA diatur **per client per prioritas** (menu **⏱️ Setting SLA**, juga di Monitoring Client → SLA PRL), dibedakan **Solusi Sementara** dan **Solusi Permanen**; satuan jam (24/7), hari kerja, atau hari kalender.
- Batas SLA dihitung otomatis; **timeline (2 activity: sementara & permanen) + reminder email** dibuat otomatis untuk PIC MLPT, Target diisi batas SLA permanen.
- Status SLA: Tercapai, Terlambat, Lewat SLA, Sisa x jam/hari — tampil di List/Inquiry, detail project & Laporan SLA.
- Migrasi: `service/database/007_prl_sla.sql`.

### Data Client
Client ID, Nama Client, Free Mandays, Tanggal Kontrak, Periode Preventive Maintenance (mulai–selesai + frekuensi),
Price per Mandays, **daftar PIC Bank** (nama, jabatan, email, HP — dipakai sebagai pilihan PIC Bank di project), catatan, **Akhir Kontrak, Harga Maintenance / tahun, Nilai Kontrak Maintenance (TCV)**. Free mandays terpakai = total mandays tiket **Free Mandays** dalam **jangka waktu kontrak** (Tanggal → Akhir Kontrak; bila kosong: periode PM / tahun kontrak). Mandays langsung terpotong sejak tiket dicatat walau belum selesai, **kecuali tiket Cancel**.

## 🗂️ Struktur Folder (modular)

```
ProjectManager/
├── index.html              # kerangka: sidebar + konten
├── app.js                  # MAIN APP — hanya import & daftarkan modul menu
├── program/                # 📱 TAMPILAN tiap menu
│   ├── shell.js            # sidebar, user, menu aktif
│   ├── login.js
│   ├── dashboard/dashboard.js
│   ├── inquiry/inquiry.js
│   ├── project/            # project-list, project-detail (4 tab), project-form
│   ├── activity/           # activity-board (Gantt/Kanban/Tabel), activity-form
│   ├── client/             # client-monitoring (price & free MD), client-detail, client-form
│   ├── reminder/reminder.js
│   ├── settings/           # settings, settings-users (user × client), settings-master
│   └── shared/             # gantt.js, kanban.js, project-table.js
├── service/                # ⚙️ LOGIKA & DATA
│   ├── supabase.config.js  # 🔑 URL & anon key Supabase
│   ├── database.service.js # satu-satunya file yang bicara dengan Supabase
│   ├── store.service.js    # cache data + simpan ke database / lokal + realtime
│   ├── auth.service.js     # login, role, client yang boleh diakses
│   ├── project.service.js  # project, hitung TCV/GP, Uniq ID, assignment, history
│   ├── activity.service.js # activity, target vs realtime, beban member
│   ├── client.service.js   # client & monitoring free mandays
│   ├── member.service.js   # user / member tim
│   ├── workload.service.js # agregasi dashboard
│   ├── reminder.service.js # isi reminder & kirim email
│   ├── master.service.js   # parameter (tipe, status, modul, tim, dll)
│   ├── ui / format / export / router / demo .service.js
│   ├── database/           # 001_schema.sql, 002_reminder_cron.sql
│   └── functions/daily-reminder/index.ts   # Supabase Edge Function email
└── style/                  # 🎨 theme, base, layout, components, pages
```

### Cara menambah menu baru
1. Buat file di `program/<menu>/` yang meng-export `{ path, title, render(el, params) }`.
2. Logika data di `service/<nama>.service.js`.
3. Daftarkan di `app.js` (import + tambah ke `MODULES`) dan di `MENU` pada `program/shell.js`.

## 🗄️ Setup Supabase

Project Supabase: **ProjectManager_** (semua tabel berawalan `pm_`).

1. **SQL Editor → New query** → paste isi `service/database/001_schema.sql` → **Run**.
2. **Authentication → Users → Add user** untuk tiap anggota tim (centang *Auto Confirm User*).
3. **Project Settings → API**: salin **Project URL** dan kunci **anon / publishable**, isi ke `service/supabase.config.js`.
4. Login → **Setting → User & Client** → tambahkan diri Anda sebagai **Admin** (email sama dengan akun login),
   lalu tambahkan user lain & centang client yang mereka handle.
   *Selama belum ada user Admin, semua akun yang login dianggap admin (untuk setup awal).*

### Hak akses (Row Level Security)
| Role | Akses |
|---|---|
| Admin | Semua client, project, activity + menu Setting & ubah harga/free mandays |
| Project Manager / Member | Hanya client yang dicentang di Setting → User & Client (dijaga di database, bukan hanya disembunyikan) |

Berlaku untuk **Dashboard, Inquiry Project, List Project, Weekly Meeting, Activity Member, Monitoring Client, History Trend & Reminder**:
- Member lain hanya terlihat bila meng-handle client yang sama; activity internal (tanpa project) hanya terlihat pemiliknya.
- Reminder: Member hanya melihat miliknya, PM melihat timnya. Hapus project khusus Admin.
- Admin bisa klik **👁 Lihat sebagai** di Setting → User & Client untuk mengecek tampilan persis seperti user tersebut.
- Jalankan `service/database/006_akses_client.sql` agar aturan yang sama berlaku di database.

### Tabel
| Tabel | Isi |
|---|---|
| `pm_clients` | data client, harga per mandays, free mandays, periode PM |
| `pm_projects` | data project (+ `members` jsonb untuk member assignment) |
| `pm_project_history` | history update project |
| `pm_activities` | activity member: timeline target & realtime, progress, status |
| `pm_members` | user / member tim, role, client yang di-handle (`client_ids`) |
| `pm_settings` | master data & pengaturan reminder |
| `pm_reminder_logs` | log pengiriman email reminder |

Relasi: `pm_clients ──< pm_projects ──< pm_activities >── pm_members`, `pm_projects ──< pm_project_history`.

## ✉️ Reminder email harian (opsional)

Pengiriman email memakai **Supabase Edge Function** + [Resend](https://resend.com) (gratis 3.000 email/bulan).

```bash
supabase functions deploy daily-reminder --no-verify-jwt
supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="Project Manager <pm@domainanda.com>" CRON_SECRET=isi-acak-panjang
```

Lalu aktifkan extension **pg_cron** & **pg_net** (Database → Extensions), isi `<PROJECT_REF>` & `<CRON_SECRET>`
di `service/database/002_reminder_cron.sql`, dan jalankan di SQL Editor. Default: Senin–Jumat 07:30 WIB.
Tanpa langkah ini, menu Reminder tetap bisa dipakai lewat tombol **Draft email** / **Salin teks**.

## 🚀 Menjalankan

Tidak perlu build — cukup web server statis:

```bash
python3 -m http.server 8080
```

Buka `http://localhost:8080`. Kalau `supabase.config.js` dikosongkan, aplikasi berjalan dalam **mode lokal**
(data di browser) dan bisa langsung diisi **data contoh** dari Dashboard / Setting → Data & Koneksi.
