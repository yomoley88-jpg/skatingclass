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

The app uses the browser Supabase client with the anon/publishable key only. It never uses a service role key.

An authenticated user is treated as admin if one of these is true:

- `app_metadata.role` is `admin`
- `app_metadata.is_admin` is `true`
- their user id exists in `public.admin_users`

All student, attendance, and storage access is also protected by RLS. Proof photos are stored as private paths in the `attendance-proof` bucket, and the app creates short-lived signed URLs only after admin login.

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
