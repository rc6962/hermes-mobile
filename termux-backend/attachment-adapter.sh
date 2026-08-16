#!/data/data/com.termux/files/usr/bin/bash
# Attachment adapter lifecycle for the Balls app (Termux mode).
#
# Starts the local attachment adapter on 127.0.0.1:8643, beside the Hermes
# gateway (8642). The adapter authenticates with the SAME API server key the
# app already uses for Hermes pairing, so no second credential is needed.
#
# Usage:
#   attachment-adapter.sh start          # start the adapter (idempotent)
#   attachment-adapter.sh stop           # stop it
#   attachment-adapter.sh status         # is it running?
#
# Prerequisites:
#   - Hermes gateway configured (hermes gateway run) with an api_server key
#   - attachment_adapter package installed in the Termux python env:
#       pip install <repo>/attachment-adapter
#     (or set PYTHONPATH to the repo's attachment-adapter/ directory)
#
# Key resolution order:
#   1. $ATTACHMENT_ADAPTER_KEY (explicit override)
#   2. hermes config get platforms.api_server.extra.key  (gateway pairing key)
set -eu

umask 077

HERMES_HOME_DIR="${HERMES_HOME:-$HOME/.hermes}"
PID_FILE="$HERMES_HOME_DIR/attachment-adapter.pid"
LOG_FILE="$HERMES_HOME_DIR/attachment-adapter.log"
ADAPTER_HOST="127.0.0.1"
ADAPTER_PORT="8643"

mkdir -p "$HERMES_HOME_DIR"

read_pid() {
  if [ -f "$PID_FILE" ]; then
    tr -d '[:space:]' < "$PID_FILE"
  fi
}

running_pid() {
  local pid
  pid="$(read_pid || true)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

resolve_key() {
  if [ -n "${ATTACHMENT_ADAPTER_KEY:-}" ]; then
    printf '%s' "$ATTACHMENT_ADAPTER_KEY"
    return 0
  fi
  hermes config get platforms.api_server.extra.key 2>/dev/null || true
}

start_adapter() {
  if running_pid; then
    printf 'Attachment adapter already running (pid %s)\n' "$(read_pid)"
    return 0
  fi

  local key
  key="$(resolve_key || true)"
  if [ -z "$key" ]; then
    printf 'Attachment adapter key not found.\n' >&2
    printf 'Set ATTACHMENT_ADAPTER_KEY or configure platforms.api_server.extra.key.\n' >&2
    return 1
  fi

  rm -f "$PID_FILE"
  ATTACHMENT_ADAPTER_KEY="$key" nohup python -m attachment_adapter.server \
    --host "$ADAPTER_HOST" --port "$ADAPTER_PORT" >>"$LOG_FILE" 2>&1 </dev/null &
  printf '%s\n' "$!" > "$PID_FILE"
  printf 'Attachment adapter start requested (pid %s)\n' "$(read_pid)"
}

stop_adapter() {
  if ! running_pid; then
    rm -f "$PID_FILE"
    printf 'Attachment adapter is not running\n'
    return 0
  fi

  local pid
  pid="$(read_pid)"
  kill "$pid"
  for _ in 1 2 3 4 5; do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE"
      printf 'Attachment adapter stopped\n'
      return 0
    fi
    sleep 1
  done
  printf 'Attachment adapter did not stop cleanly (pid %s)\n' "$pid" >&2
  return 1
}

status_adapter() {
  if running_pid; then
    printf 'Attachment adapter running (pid %s) on %s:%s\n' "$(read_pid)" "$ADAPTER_HOST" "$ADAPTER_PORT"
    return 0
  fi
  printf 'Attachment adapter not running\n'
  return 1
}

case "${1:-}" in
  start)   start_adapter ;;
  stop)    stop_adapter ;;
  status)  status_adapter ;;
  *)
    printf 'Usage: %s {start|stop|status}\n' "$0" >&2
    exit 2
    ;;
esac
