# Learn A Palooza — Draft Counter

A kiosk-style page: attendees tap a button, get a LinkedIn draft (no repeats
until every draft has been used once), the text is copied to their
clipboard, and LinkedIn opens ready to paste it in.

## How the no-repeat logic stays correct with many people at once

Instead of storing a "shuffled deck" that every request would read, modify,
and write back (a race condition when many people tap at the same second),
this uses:

1. **One atomic counter** (`kv.incr`) in Redis for the ticket number. Redis
   guarantees every caller gets a unique, sequential number even under heavy
   concurrent load — no locking needed.
2. **A deterministic seeded shuffle** that turns a ticket number into a
   draft index. Ticket numbers `0..N-1` are round 0's shuffled order,
   `N..2N-1` are round 1's, and so on. The shuffle for a given round is a
   pure function of the round number, so it never needs to be stored or
   recomputed under a lock — any server instance gets the same answer.

The only shared mutable state is the counter itself, and that single
`INCR` is what Redis is built to make safe.

## Deploying to Vercel

1. Push this project to a GitHub repo and import it in Vercel
   ("Add New… → Project").
2. In the Vercel project, go to **Storage → Marketplace Database Providers**
   and add a **Redis** database (the Upstash integration is the standard
   option here — Vercel's own KV product has been retired in favor of it).
   Connecting it to this project injects `KV_REST_API_URL` /
   `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` /
   `UPSTASH_REDIS_REST_TOKEN`, depending on how you connect it) automatically
   — `lib/kv.js` reads whichever pair is present, so you don't need to set
   those by hand.
3. In **Settings → Environment Variables**, add:
   - `ADMIN_SECRET` — a password of your choosing, used to protect the
     "organizer setup" panel that edits the draft list.
4. Deploy.

The 15 drafts you gave me are baked in as the default set (see
`lib/defaultDrafts.js`), so the site works immediately — no setup required
before the event. To change the drafts later, tap "organizer setup" on the
page, enter your `ADMIN_SECRET`, edit the text (drafts separated by a line
containing just `---`), and save. Saving resets the ticket queue, so do it
before the event starts, not mid-event.

## Local development

```bash
npm install
vercel env pull .env.local   # after connecting KV in the Vercel dashboard
npm run dev
```

You need a KV database connected (even for local dev) since there's no
in-memory fallback — that's what makes the counter safe across multiple
serverless function instances in production.
