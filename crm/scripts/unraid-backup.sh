#!/bin/bash
# etc. CRM backups, off the NVMe pool: copy Coolify's nightly pg_dump of etc-crm-db into /mnt/user/backup/etc-crm
# (parity array; Duplicacy uploads that share to Google Drive at 02:00). Checks the dump every night and does a full
# test restore into a throwaway Postgres on Sundays (or with "restore"). Failures raise an Unraid notification.
set -euo pipefail
SRC=/mnt/shaganappi/appdata/coolify/backups/databases/root-team-0/etc-crm-db-e68s22hnlu8bpliwylqklspr
DEST=/mnt/user/backup/etc-crm
KEEP_DAYS=30
LOG="$DEST/last-run.txt"
notify() { /usr/local/emhttp/webGui/scripts/notify -e "etc. CRM backup" -s "etc. CRM backup FAILED" -d "$1" -i alert >/dev/null 2>&1 || true; }
fail() { echo "FAIL $(date -u +%FT%TZ) $1" | tee "$LOG"; notify "$1"; exit 1; }
trap 'fail "script error on line $LINENO"' ERR

mkdir -p "$DEST"
latest=$(ls -t "$SRC"/*.dmp 2>/dev/null | head -1 || true)
[ -n "$latest" ] || fail "no dumps found in $SRC"
age_h=$(( ( $(date +%s) - $(stat -c %Y "$latest") ) / 3600 ))
[ "$age_h" -le 30 ] || fail "newest dump is ${age_h}h old (Coolify's nightly backup didn't run)"
size=$(stat -c %s "$latest")
[ "$size" -gt 10000 ] || fail "newest dump is only $size bytes"

cp -p "$latest" "$DEST/"
name=$(basename "$latest")
docker run --rm -v "$DEST:/b:ro" postgres:17 pg_restore -l "/b/$name" >/dev/null || fail "pg_restore can't read $name"
find "$DEST" -name '*.dmp' -mtime +"$KEEP_DAYS" -delete

# Photos, signatures and other uploads (not in the database dump). Mirror: never deletes, so a wiped volume can't wipe the copy.
MEDIA=/var/lib/docker/volumes/36olzax3kszbkawfyvo3tpga-etc-crm-data/_data
[ -d "$MEDIA/uploads" ] || fail "media volume not found at $MEDIA"
rsync -a "$MEDIA/" "$DEST/media/"

msg="copied $name ($((size / 1024)) KB, ${age_h}h old), archive OK, media $(du -sh "$DEST/media" | cut -f1)"
if [ "${1:-}" = "restore" ] || [ "$(date +%u)" = 7 ]; then
  c="etc-restore-test-$$"
  docker run -d --rm --name "$c" -e POSTGRES_PASSWORD=x -v "$DEST:/b:ro" postgres:17 >/dev/null
  trap 'docker rm -f "$c" >/dev/null 2>&1; fail "test restore failed on line $LINENO"' ERR
  for _ in $(seq 30); do docker exec "$c" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 2; done
  docker exec "$c" createdb -U postgres etc
  docker exec "$c" pg_restore -U postgres -d etc --no-owner --no-acl "/b/$name"
  n() { docker exec "$c" psql -U postgres -d etc -tAc "select count(*) from \"$1\""; }
  counts="$(n Client) clients, $(n Invoice) invoices, $(n Visit) visits"
  docker rm -f "$c" >/dev/null
  trap 'fail "script error on line $LINENO"' ERR
  [ -n "$counts" ] || fail "test restore produced no data"
  msg="$msg; test restore OK: $counts"
fi
echo "OK $(date -u +%FT%TZ) $msg" | tee "$LOG"
