#!/data/data/com.termux/files/usr/bin/bash
set -eu

umask 077

HERMES_HOME_DIR="${HERMES_HOME:-$HOME/.hermes}"
PID_FILE="$HERMES_HOME_DIR/mobile-gateway.pid"
LOG_FILE="$HERMES_HOME_DIR/mobile-gateway.log"

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

start_gateway() {
  if running_pid; then
    printf 'Hermes gateway already running (pid %s)\n' "$(read_pid)"
    return 0
  fi

  rm -f "$PID_FILE"
  nohup hermes gateway run >>"$LOG_FILE" 2>&1 </dev/null &
  printf '%s\n' "$!" > "$PID_FILE"
  printf 'Hermes gateway start requested (pid %s)\n' "$(read_pid)"
}

stop_gateway() {
  if ! running_pid; then
    rm -f "$PID_FILE"
    printf 'Hermes gateway is not running\n'
    return 0
  fi

  local pid
  pid="$(read_pid)"
  kill "$pid"
  for _ in 1 2 3 4 5; do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE"
      printf 'Hermes gateway stopped\n'
      return 0
    fi
    sleep 1
  done

  kill -KILL "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  printf 'Hermes gateway stopped forcefully\n'
}

case "${1:-}" in
  start)
    start_gateway
    ;;
  stop)
    stop_gateway
    ;;
  restart)
    stop_gateway
    start_gateway
    ;;
  doctor)
    exec hermes doctor
    ;;
  update)
    exec hermes update
    ;;
  *)
    printf 'Usage: %s {start|stop|restart|doctor|update}\n' "$0" >&2
    exit 64
    ;;
esac
