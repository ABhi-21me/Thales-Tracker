# Track Thales — Value Proof Engine

A clean, mobile-first meeting and progress tracker for the university industry project (**Value Proof Engine**).

## Tech Stack
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4, Lucide Icons, `react-markdown`
- **Backend**: Supabase (Postgres, Auth, Row Level Security, DB Triggers)

## Project Structure
```text
├── index.html
├── package.json
├── .env.example
└── src/
    ├── App.tsx               # App shell, navigation, auth state, modals
    ├── index.css             # Tailwind v4, theme, dialog & responsive table rules
    ├── main.tsx
    ├── lib/
    │   ├── supabase.ts       # Supabase client & env check
    │   └── dates.ts          # Date formatting, weekday derivation, .ics & Google Cal helpers
    ├── types/
    │   └── database.ts       # TypeScript models
    ├── components/
    │   ├── AdminLoginModal.tsx
    │   ├── ActionItemModal.tsx
    │   ├── MeetingDrawer.tsx
    │   ├── MeetingFormModal.tsx
    │   ├── PasscodeGate.tsx
    │   └── ui/
    │       ├── Badge.tsx
    │       ├── Calendar.tsx
    │       ├── CommandPalette.tsx
    │       ├── Dialog.tsx
    │       ├── StateViews.tsx
    │       └── Toast.tsx
    └── pages/
        ├── HomePage.tsx
        ├── MeetingsPage.tsx
        ├── ContactsPage.tsx
        ├── ResourcesPage.tsx
        └── SchedulePage.tsx
```

## Setup Guide

### 1. Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Open **Project Settings → API** and copy your **Project URL** and **anon public key**.

### 2. Configure Database & RLS
Ensure your Supabase database has the required tables (`meetings`, `action_items`, `contacts`, `resources`, `meet_requests`, `activity_log`) and authenticated RLS policies reading `auth.jwt() -> 'app_metadata' ->> 'role'` (`'admin'` or `'viewer'`) with no `anon` access.

### 3. Create Viewer & Admin Users (No Public Signup)
1. In the Supabase Dashboard, go to **Authentication → Providers → Email** and disable **Allow new users to sign up**.
2. Go to **Authentication → Users → Add user → Create new user** and create:
   - **Viewer user**: e.g. `viewer@trackthales.local` with your shared viewer passcode as the password (check **Auto Confirm User**).
   - **Admin user**: your admin email and password (check **Auto Confirm User**).
3. Assign each user's role in `auth.users.raw_app_meta_data` via the SQL Editor (RLS reads `auth.jwt() -> 'app_metadata' ->> 'role'`):
```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "viewer"}'::jsonb
where email = 'viewer@trackthales.local';

update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
where email = 'your-admin-email@university.edu';
```

### 4. Configure Environment Variables & Run Locally
```bash
cp .env.example .env
# Edit .env with:
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_ANON_KEY=...
# VITE_VIEWER_EMAIL=viewer@trackthales.local

npm install
npm run dev
```

### 5. Build & Deploy
```bash
npm run build
```
Deploy the `dist/` folder to Vercel, Netlify, or Cloudflare Pages, and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_VIEWER_EMAIL` in your hosting provider's environment variables.
