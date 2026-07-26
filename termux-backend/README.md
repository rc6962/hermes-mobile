# Termux backend helpers

This directory will contain fixed, reviewable scripts for managing the Hermes backend from the Android frontend:

- install/setup;
- start;
- stop/restart;
- doctor/status;
- update.

The frontend should use Termux `RUN_COMMAND` only for these lifecycle operations. Chat traffic belongs on Hermes' authenticated local HTTP/SSE API, not in terminal output parsing.

Scripts must never contain API keys or other user secrets.

`mobile-lifecycle.sh` is the fixed helper invoked by the Android Capacitor plugin. It accepts
only `start`, `stop`, `restart`, `doctor`, and `update`; normal chat never passes through it.
Install it as `$HOME/.hermes/mobile-lifecycle.sh` with mode `700` inside Termux.
