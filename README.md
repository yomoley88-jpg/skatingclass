# Skating Attendance

Admin-only attendance and payment tracking for one skating class.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Run `supabase/schema.sql` in the Supabase SQL editor before using the app.

## Admin Access

The app has no in-app login screen. Protect the Vercel project itself so only admins can open it.

Because proof photos are private, the browser does not talk directly to Supabase for admin operations. It calls Vercel API routes, and those routes use `SUPABASE_SERVICE_ROLE_KEY` from server-only environment variables.

Required Vercel environment variables:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` must only be set in Vercel/local server env. Never expose it in frontend code or commit it to GitHub.

## Core Flow

- Admin signs in.
- Admin marks active students present or absent.
- Admin uploads one or more class proof photos.
- Admin may upload optional individual student proof photos.
- Saving attendance creates a session, uploads private proof files, stores records, and increments the current lesson count for present students.
- At 3 attended lessons the UI shows `Ping Parent`.
- At 4 attended lessons the UI shows `Payment Due` as a reminder only.
- Admin marks payment manually when payment is actually received.
- `Mark Paid` is available whenever the student has attended lessons to clear, and resets `current_lesson_count` to 0.
