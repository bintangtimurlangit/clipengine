# Upgrades

ClipEngine moves fast. Here's the process for keeping a self-host in
sync without losing your runs.

## Versioning

Tagged releases land on GHCR as
`ghcr.io/bintangtimurlangit/clipengine-{api,web}:vX.Y.Z` and
`:latest`. Both `linux/amd64` and `linux/arm64` are published.

## Compose

```bash
cd clipengine
git pull
docker compose -f deploy/compose.yaml pull
docker compose -f deploy/compose.yaml up -d
```

Migrations apply automatically on api startup. The worker pool waits
for migrations before draining the queue.

## Bare metal

```bash
git pull
pnpm install --frozen-lockfile
pnpm build
sudo systemctl restart clipengine-api clipengine-web
```

Run `pnpm --filter @clipengine/db db:migrate` first if your release
notes call for it (the api process runs migrations itself; this is
only useful in scripted backup-and-restore scenarios).

## Rollback

The DB schema is forward-compatible inside a major version (we add
columns; we don't drop them). Rolling back to the previous tag is
safe as long as you stay within the same `vX` major.

```bash
docker compose -f deploy/compose.yaml down
git checkout vX.Y.Z-1
docker compose -f deploy/compose.yaml pull
docker compose -f deploy/compose.yaml up -d
```

If a release flips `schema_version` on a JSON blob (e.g. presets), the
DB migration writes the migrated copy and keeps the original around in
a `*_legacy` field for one major. Check the release notes if you
intend to roll back across that boundary.

## Backups

See [backup-restore.md](backup-restore.md). Always back up before
upgrading a major version.
