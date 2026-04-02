# TruMonie Admin Dashboard (Next.js)

This app is the operations dashboard for merchant/POS control and uses the same backend as the mobile app.

## Features in this MVP

- Admin login (JWT via backend `/api/auth/login`)
- Merchant queue (`/api/admin/merchants`)
- Merchant status actions (approve/reject/suspend)
- Merchant details view (merchant, terminals, settlements, transactions)
- Terminal control (activate/deactivate/suspend + heartbeat)
- Settlement monitor and status controls
- Transaction explorer (channel/status filtering)
- Risk view cards sourced from admin metrics endpoints

## Run locally

1. Install dependencies:
   - `cd admin`
   - `npm install`
2. Create env:
   - copy `.env.example` to `.env.local`
   - set `NEXT_PUBLIC_API_URL` (for local backend: `http://localhost:3000/api`)
3. Start:
   - `npm run dev`
4. Open:
   - `http://localhost:3000/login` (or whichever port Next chooses)

## Backend prerequisites

1. Backend must be running with the latest merchant migration:
   - `cd backend`
   - `npm run typeorm:migration:run`
2. Backend CORS should allow the admin origin:
   - set `APP_CORS_ORIGINS` in backend env, for example:
     - `APP_CORS_ORIGINS=http://localhost:3000,http://localhost:3001`
3. Login with a user that has `role=ADMIN`.

