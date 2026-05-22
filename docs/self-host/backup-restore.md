# Backup & restore

Two volumes hold everything: `data` and `workspace`. Backups are just
copies of those directories.

## What lives where

`<DATA_DIR>` (volume `data`):
- `clipengine.sqlite` — admin account, settings, presets, logos table,
  runs metadata, run logs, run artifacts.
- `logos/<id>.<ext>` — actual logo files.
- `uploads/<userId>/<id>.part` — half-finished uploads. Safe to drop.

`<WORKSPACE>` (volume `workspace`):
- `runs/<run_id>/source.<ext>` — acquired media.
- `runs/<run_id>/transcript.json` — ingest output.
- `runs/<run_id>/cut_plan.json` — plan output.
- `runs/<run_id>/rendered/{longform,shortform}/...` — rendered MP4s,
  JPEGs, captions.

## Backup (Docker)

Stop the api container before snapshotting SQLite to avoid copying a
WAL mid-write:

```bash
docker compose -f deploy/compose.yaml stop api
docker run --rm \
    -v clipengine_data:/source/data:ro \
    -v clipengine_workspace:/source/workspace:ro \
    -v "$(pwd)":/backup \
    alpine sh -c 'cd /source && tar czf /backup/clipengine-backup-$(date +%Y%m%d).tar.gz data workspace'
docker compose -f deploy/compose.yaml start api
```

For online backups, use SQLite's `.backup` command:

```bash
docker compose -f deploy/compose.yaml exec api \
    sh -c 'sqlite3 /data/clipengine.sqlite ".backup /data/snapshot.sqlite"'
```

Then archive `/data/snapshot.sqlite` and the workspace separately.

## Backup (bare metal)

```bash
sudo systemctl stop clipengine-api
tar czf clipengine-backup-$(date +%Y%m%d).tar.gz \
    /var/lib/clipengine/data \
    /var/lib/clipengine/workspace
sudo systemctl start clipengine-api
```

(Adjust paths for your install.)

## Restore

```bash
docker compose -f deploy/compose.yaml down
docker volume rm clipengine_data clipengine_workspace
docker volume create clipengine_data
docker volume create clipengine_workspace
docker run --rm \
    -v clipengine_data:/dst/data \
    -v clipengine_workspace:/dst/workspace \
    -v "$(pwd)":/backup \
    alpine sh -c 'cd /dst && tar xzf /backup/clipengine-backup-YYYYMMDD.tar.gz'
docker compose -f deploy/compose.yaml up -d
```

The api process applies any newer migrations on first boot; old
backups inside the same major version restore cleanly.

## What you can throw away

- `<DATA_DIR>/uploads/` — only contains half-finished uploads.
- `<WORKSPACE>/runs/<run_id>/audio_16k_mono.wav` for completed runs —
  the transcript is the durable bit; the WAV is intermediate.

Everything else is canonical state.
