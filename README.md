# ROKUHARA V2 — Vercel + Supabase

## 1. Folder foto/logo
- `public/assets/logo/` → logo utama Rokuhara
- `public/assets/images/` → foto/banner/circle/team
- `public/assets/icons/` → icon

Logo utama yang dipakai website: `public/assets/logo/rokuhara-logo.png`

Kalau nama file berbeda, ubah path di `public/index.html`.

## 2. Buat Supabase
1. Buka Supabase dan buat project baru.
2. Masuk **SQL Editor**.
3. Buka `supabase/schema.sql`.
4. Copy semua isi file → paste → Run.
5. Database dasar dibuat: profiles, circles, circle_members, announcements, messages.
6. Realtime disiapkan untuk circles, announcements, messages.

## 3. Ambil credential publik
Supabase → Project Settings → API.
Ambil **Project URL** dan **Publishable/anon key**.

Edit `public/config.js`:
```js
SUPABASE_URL: "https://xxxx.supabase.co",
SUPABASE_ANON_KEY: "KEY_LU"
```

JANGAN taruh `service_role`/secret key di frontend atau GitHub.

## 4. Masukkan link community
Di `public/config.js`, ganti:
- `DISCORD_URL`
- `WHATSAPP_URL`

## 5. Tes dengan Termux
Dari folder project:
```bash
cd public
python -m http.server 8080
```
Buka `http://localhost:8080`.

## 6. Upload ke GitHub
```bash
git init
git add .
git commit -m "Rokuhara V2"
git branch -M main
git remote add origin https://github.com/USERNAME/rokuhara.git
git push -u origin main
```
Ganti USERNAME dengan username GitHub lu.

## 7. Deploy Vercel
1. Login Vercel dengan GitHub.
2. Add New Project.
3. Import repo Rokuhara.
4. Deploy.
5. Vercel akan memberi domain `*.vercel.app`.

## 8. Admin Rokuhara
- Riyoo / Riyzz — Founder / Developer — full technical access
- Rapaa / Momos — Owner / Group Owner
- Vinoo / Vinz / Vinos — Community/Event Admin

Permission admin nantinya harus dicek server-side/RLS, bukan dipercaya dari JavaScript frontend.

## 9. Upgrade berikutnya
Fondasi V2 sudah siap untuk:
- login/register
- profile + Rokuhara ID
- Circle membership
- realtime chat
- admin dashboard
- announcement CRUD
- recruitment
- report/moderation

Command announcement yang direncanakan:
`/announcement create`, `/announcement edit`, `/announcement delete`, `/announcement pin`, `/announcement list`.
