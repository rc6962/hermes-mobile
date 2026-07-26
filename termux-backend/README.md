# Termux backend helpers

This directory will contain fixed, reviewable scripts for managing the Hermes backend from the Android frontend:

- install/setup;
- start;
- stop/restart;
- doctor/status;
- update.

The frontend should use Termux `RUN_COMMAND` only for these lifecycle operations. Chat traffic belongs on Hermes' authenticated local HTTP/SSE API, not in terminal output parsing.

Scripts must never contain API keys or other user secrets.
