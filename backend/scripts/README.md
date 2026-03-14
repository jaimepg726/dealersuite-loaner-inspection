# Emergency DB Rescue Scripts

These scripts address the production issue where the Railway PostgreSQL volume
fills up due to legacy `BYTEA` blobs stored in the `inspection_media` table.

Run them **in order** using the Railway CLI.

---

## Prerequisites

1. Install the [Railway CLI](https://docs.railway.app/develop/cli) and log in:
   ```bash
   npm install -g @railway/cli
   railway login
   railway link        # link to your project if not already linked
   ```

2. Ensure Google Drive is connected in the admin UI (`/admin/settings`) so
   that valid OAuth tokens exist in the `app_settings` table before running
   Phase 1.

---

## Phase 1 — Backfill BYTEA media to Google Drive

`rescue_backfill.py` reads every `inspection_media` row where `file_data IS NOT
NULL`, uploads the bytes to Google Drive, saves the Drive metadata, and **sets
`file_data = NULL`** — committing after each individual record.

### Dry-run first (no changes made)

```bash
railway run python scripts/rescue_backfill.py --dry-run
```

### Full migration

```bash
railway run python scripts/rescue_backfill.py
```

### Migrate a small batch (useful for testing)

```bash
railway run python scripts/rescue_backfill.py --limit 10
```

**The script is safe to re-run.** Already-migrated rows (where `file_data` is
already `NULL`) are automatically skipped by the query filter.  If the script
is interrupted, simply run it again — it will continue from where it left off.

Expected output:

```
2026-03-14 10:00:00  INFO     Records with non-null file_data: 312
2026-03-14 10:00:01  INFO     Drive folders ready: {'root': '...', 'inspections': '...', 'damage': '...'}
2026-03-14 10:00:02  INFO     [1/312] id=4  size=1,048,576 B  mime=image/jpeg  file=M498_checkout_...jpg
2026-03-14 10:00:05  INFO       uploaded file_id=1abc...XYZ — file_data nulled and committed
...
2026-03-14 10:15:00  INFO     === rescue_backfill.py complete — migrated=312  dry_run_skipped=0  errors=0 ===
```

---

## Phase 2 — Reclaim disk space with VACUUM FULL

Setting `file_data = NULL` frees the *logical* storage, but Postgres holds onto
the physical pages as dead tuples until vacuumed.  `vacuum_db.py` runs
`VACUUM FULL inspection_media` which **physically rewrites the table** and
returns disk space to the OS.

> **Warning:** `VACUUM FULL` takes an **exclusive lock** on `inspection_media`
> for the entire duration.  All reads and writes on that table will block.
> Run this during off-peak hours or in a scheduled maintenance window.

```bash
railway run python scripts/vacuum_db.py
```

Expected output:

```
2026-03-14 10:20:00  INFO     === vacuum_db.py starting ===
2026-03-14 10:20:00  INFO     Table target: inspection_media
2026-03-14 10:20:01  INFO     Rows in inspection_media: 312 total, 312 with file_data=NULL (eligible for reclamation)
2026-03-14 10:20:01  INFO     Size BEFORE vacuum: 847 MB
2026-03-14 10:20:01  INFO     Starting VACUUM FULL inspection_media — the table will be locked until complete...
2026-03-14 10:20:14  INFO     VACUUM FULL completed in 13.2 s
2026-03-14 10:20:14  INFO     Size BEFORE vacuum: 847 MB
2026-03-14 10:20:14  INFO     Size AFTER  vacuum: 128 kB
2026-03-14 10:20:14  INFO     Disk space has been returned to the OS. Railway volume usage should drop.
2026-03-14 10:20:14  INFO     === vacuum_db.py done ===
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `No valid Google Drive access token` | Connect Drive in admin UI, then re-run Phase 1 |
| `Drive initiate-session failed 401` | Token expired mid-run; re-run (it will auto-refresh) |
| `FAILED id=NNN: ...` | The script skips that record and continues; re-run at the end to retry failures |
| `No rows have file_data=NULL yet` | Run Phase 1 first |
| Railway session times out during vacuum | Run `railway run --detach python scripts/vacuum_db.py` to detach from the terminal |

---

## Running from a local machine against the production DB

If Railway CLI session limits are a concern, you can export the `DATABASE_URL`
and run locally:

```bash
export DATABASE_URL="$(railway variables get DATABASE_URL)"
export JWT_SECRET="$(railway variables get JWT_SECRET)"
cd backend
python scripts/rescue_backfill.py
python scripts/vacuum_db.py
```
