Create Users Table - Admin Endpoint

This folder contains a small Express administrative endpoint that will create the `users` table if it does not exist.

Why this exists
- Creating database schema must be done server-side with elevated privileges. This script uses the Postgres connection string (`DATABASE_URL`) and executes the provided `CREATE TABLE IF NOT EXISTS` SQL.

Security
- Protect the endpoint with `ADMIN_TOKEN` (shared secret sent as `x-admin-token` header or `?token=` query param).
- Do NOT expose this endpoint publicly without network protections.

Setup
1. Create a directory and install dependencies:

   npm init -y
   npm install express pg dotenv

2. Create a `.env` file with these variables:

   DATABASE_URL=postgres://... (your Postgres connection string)
   ADMIN_TOKEN=some-strong-secret
   PORT=3000

Run

   node create_users_table.js

Example curl (create table):

   curl -X POST \ 
     -H "x-admin-token: YOUR_ADMIN_TOKEN" \
     http://localhost:3000/admin/create-users-table

If successful, you'll receive:

  { "ok": true, "message": "users table created or already exists" }

Notes
- This script executes a `CREATE TABLE IF NOT EXISTS` SQL and is idempotent.
- For production, run this as a one-off migration or protect the endpoint behind a VPN/admin network rather than leaving it enabled.
- Prefer using migrations (eg. pg-migrate) or Supabase Migrations for production schema management.
