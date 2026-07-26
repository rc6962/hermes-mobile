# Hermes Mobile

Android chat frontend for [Hermes Agent](https://github.com/NousResearch/hermes-agent) running in Termux.

## Goal

Provide a simple, polished mobile chat experience without exposing the full Hermes dashboard or requiring the user to interact with the Termux terminal during normal use.

```text
Android APK (React/Capacitor)
        |
        | HTTP + SSE over 127.0.0.1
        v
Hermes API server in Termux
```

## Planned first milestone

Build a thin proof-of-concept client that can:

- detect/check the local Hermes backend;
- authenticate to the local API server;
- submit one prompt through `/v1/runs`;
- render streaming events from `/v1/runs/{run_id}/events`;
- stop an active run;
- reconnect after the backend restarts.

The first milestone intentionally excludes phone automation, the full dashboard, and update distribution. Those will be added only after the Termux-to-APK integration is proven.

## Repository layout

- `mobile/` — React/TypeScript mobile frontend, later packaged as an APK with Capacitor.
- `termux-backend/` — controlled setup, start, diagnostics, and update helpers for Hermes in Termux.
- `docs/` — architecture and integration notes.

## Backend contract

The frontend will use Hermes' documented API server rather than scraping terminal output or embedding the Hermes Python runtime.

Expected local backend:

```text
http://127.0.0.1:8642
```

Relevant endpoints:

- `GET /health`
- `GET /v1/capabilities`
- `POST /v1/runs`
- `GET /v1/runs/{run_id}/events`
- `POST /v1/runs/{run_id}/stop`
- `POST /v1/runs/{run_id}/approval`
- `GET /api/sessions`
- `GET /api/sessions/{id}/messages`

## Status

Repository scaffold created. The next implementation task is the API connectivity proof of concept.

## Development notes

Do not commit API keys, Termux credentials, APK signing keys, or local Hermes configuration. Keep the local API server bound to loopback during development.
