#!/bin/sh
# cPanel schedule: */5 * * * * (never more frequently on Stellar).
set -eu
umask 077
APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
cd "$APP_DIR"
: "${BEHTAR_ENV_FILE:?Set absolute private BEHTAR_ENV_FILE in the cron command}"
: "${BEHTAR_NODE_BIN:?Set the Node 22.23.2 binary path in the cron command}"
: "${BEHTAR_LOG_DIR:?Set an absolute private log directory in the cron command}"
case "$BEHTAR_ENV_FILE:$BEHTAR_LOG_DIR" in *public_html*|*friend-test*|*private_uploads*) exit 1;; esac
test -f "$BEHTAR_ENV_FILE" && test -x "$BEHTAR_NODE_BIN" && test -d "$BEHTAR_LOG_DIR"
# This private owner-controlled file exports only production environment values.
. "$BEHTAR_ENV_FILE"
export NODE_ENV=production BEHTAR_PRODUCTION=1
LOCK_FILE="$BEHTAR_LOG_DIR/notification-worker.lock"
LOG_FILE="$BEHTAR_LOG_DIR/notification-worker.log"
(
  flock -n 9 || exit 0
  timeout 240s "$BEHTAR_NODE_BIN" "$APP_DIR/cron-notifications.cjs" >> "$LOG_FILE" 2>&1
) 9> "$LOCK_FILE"
