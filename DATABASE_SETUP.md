# Why clients were disappearing (and how it's fixed)

The old version of this app kept every client, lead, and conversation in a
single file: `data/store.json`, sitting on the server's local disk.

That's fine on your laptop. It breaks on Railway, Render, or any other
container host, because:
- Every time you redeploy (push new code), the platform builds a **fresh
  container** — the old disk, and the file on it, is gone.
- On free/low tiers, the platform can also restart or rebuild your
  container on its own (to save resources) — same result.

So every "new day" you saw, you were actually looking at a brand new,
empty container that had never seen your data.

**The fix:** the app now stores everything in a real Postgres database
instead of a file. Postgres runs as its own separate, persistent service —
your app container can be destroyed and rebuilt a hundred times and the
database, and every client in it, doesn't move. This is the standard,
correct way to run this kind of app in production.

Nothing about how you *use* the dashboard changes. This was a backend-only
change (see `db.js`).

---

# Deploying on Railway (recommended)

Railway can host both the app and the Postgres database in one project,
with no separate accounts or bills to juggle.

## 1. Create the project
1. Go to [railway.app](https://railway.app) and sign in (GitHub login is easiest).
2. Push this project to a GitHub repo (Railway deploys from GitHub).
3. In Railway: **New Project → Deploy from GitHub repo** → pick your repo.

## 2. Add Postgres
1. In the same project, click **+ New → Database → Add PostgreSQL**.
2. Railway spins up a Postgres instance and automatically creates a
   `DATABASE_URL` variable.
3. Click your **app service** (not the database) → **Variables** tab →
   **+ New Variable → Add Reference** → select the Postgres service's
   `DATABASE_URL`. This wires the two together so your app always has the
   current connection string, even if Railway rotates it.

## 3. Set the rest of your environment variables
On your app service → **Variables**, add each of these (see `.env.example`
for the full list):
- `SESSION_SECRET` — a long random string (32+ characters)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — your real admin login, not the demo one
- `WEBHOOK_SECRET` — a random string, used to protect the public lead API
- `APP_BASE_URL` — Railway gives you a URL like `https://yourapp.up.railway.app`
  once deployed; set this to that (with `https://`)
- `NODE_ENV=production`
- Any SMTP / Google OAuth variables you use for weekly reports

You do **not** need to set `DATABASE_URL` yourself — the reference variable
from step 2 handles it.

## 4. Deploy
Railway deploys automatically on push. Watch the **Deployments** tab; the
first boot will log:
```
ASSISTQ: no existing data found in Postgres — seeded default store.
ASSISTQ Growth Platform running at http://localhost:8787
```
That "seeded default store" line only appears once, the very first time —
after that, every restart or redeploy will instead log:
```
ASSISTQ: loaded existing store from Postgres.
```
That's your confirmation the data survived.

## 5. Custom domain (optional)
Railway → your app service → **Settings → Networking → Custom Domain** →
point `www.assistq.in` (or a subdomain like `app.assistq.in`) at it with
the CNAME they give you.

## Cost
Railway's Hobby plan is **$5/month**, which includes $5 of usage credit.
For an app + small Postgres database at this scale (a lead-gen dashboard
for a handful of clients), actual usage typically stays close to or under
that credit, so realistic cost is **~$5–10/month** total — well within
"paid but budget" territory, and there's no separate charge for the
database itself, it's metered from the same usage pool.

---

# Alternative: Render.com

If you'd rather use Render instead of Railway:
1. **New → Web Service**, connect your repo. Pick a **paid** instance type
   (Starter, ~$7/mo) — Render's free web services spin down after 15
   minutes of inactivity, which means the *first* visitor after a quiet
   period waits 30–60 seconds for your chatbot to wake up. Not great for a
   lead-capture widget on a client's live site.
2. **New → PostgreSQL** → pick a plan (Render's cheapest paid Postgres is
   ~$6/mo; there's a free one but it auto-expires after 30 days, so skip it
   for anything real).
3. Render automatically provides a `DATABASE_URL` env var when you link the
   database to the web service the same way as above.
4. Set the same environment variables as the Railway list above.

Render total: **~$13/month** (web service + database) — more than Railway
for the same result, which is why Railway is the recommendation above.

---

# Local development
Run a local Postgres (or use a free cloud one like a Neon/Supabase dev
project) and put its connection string in `.env` as `DATABASE_URL`. Then:
```
npm install
npm start
```
