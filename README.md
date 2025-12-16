# Dpt of Karma OSINT

Portable OSINT workspace with an AI analyst (Kimi) + evidence locker. Runs locally on `http://localhost:5000`.

## Quick start (portable mode — no Postgres required)

1. Install Node.js (recommended: Node 20+).
2. From the project folder:

```bash
npm install
npm run dev
```

3. Open:
- `http://localhost:5000`

### Persistence in portable mode

If you **do not** set `DATABASE_URL`, the app uses a file-backed datastore at:
- `data/karma-osint.json`

This is designed to be **USB-friendly** (copy the whole folder; data stays with it).

## Enable real Kimi agent responses

For the chat agent to use Kimi, set `KIMI_API_KEY`.

- Copy `config/env.example` to a new file named `.env` in the project root
- Fill in:
  - `KIMI_API_KEY=...`

Then restart `npm run dev`.

## Enable public web search (recommended)

Without a web search provider, many person/username/email targets will yield limited results because only a few public sources are queried.

Configure one of:
- **Brave**:
  - `OSINT_SEARCH_PROVIDER=brave`
  - `BRAVE_SEARCH_API_KEY=...`
- **Routeway** (if you have a search endpoint from Routeway):
  - `OSINT_SEARCH_PROVIDER=routeway`
  - `ROUTEWAY_API_KEY=...`
  - `ROUTEWAY_SEARCH_URL=...`
  - `ROUTEWAY_SEARCH_METHOD=GET` (or `POST` if required)

Then restart `npm run dev`.

## Enable Postgres (optional)

If you want full SQL persistence, set:
- `DATABASE_URL=postgresql://...`

Then provision tables:

```bash
npm run db:push
```

Restart `npm run dev`.

## “Run Investigation” button (safe OSINT)

The **Run Investigation** button collects **public, non-intrusive OSINT** and stores results as evidence/entities:
- DNS records (A/AAAA/NS/MX)
- RDAP registration (via `rdap.org`)
- Certificate transparency subdomains (via `crt.sh`)
- GitHub public profile (for username targets)

No logins, no private data access, no exploitation/scanning.

## Running from a USB / external drive (portable)

- Copy the whole folder (including `data/`) onto the drive.
- Keep a `.env` file **on the drive** next to `package.json` (this is how keys stay portable without hardcoding them in code).
- You still need **Node.js** on the machine you plug into (or a portable Node distribution on the drive).
- Start from the project folder:

```bash
npm install
npm run dev
```




