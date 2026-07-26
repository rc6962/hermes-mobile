# Hermes API contract used by Hermes Mobile

This is the pinned contract for the first mobile vertical slice. The source of truth is the
current upstream Hermes Agent API-server documentation and implementation:

- <https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server>
- <https://github.com/NousResearch/hermes-agent/blob/main/gateway/platforms/api_server.py>

The frontend is intentionally limited to loopback HTTP/SSE. It does not use the dashboard PTY,
xterm, `/api/pty`, or WebSocket transport.

## Base URL and authentication

Development default:

```text
http://127.0.0.1:8642
```

Every API request made by the mobile client carries:

```http
Authorization: Bearer <locally-configured-key>
```

The bearer value is injected at runtime and is never committed. When configured, the client may
also send `X-Hermes-Session-Key` to keep long-term memory scope stable across transcript IDs.
The header is omitted when no session key is configured.

## Health and capability discovery

### `GET /health`

Returns a liveness object, normally:

```json
{"status":"ok"}
```

### `GET /v1/capabilities`

Returns a capability document. The client checks for the relevant features before enabling
advanced UI controls:

```json
{
  "object": "hermes.api_server.capabilities",
  "platform": "hermes-agent",
  "auth": {"type":"bearer","required":true},
  "features": {
    "run_submission": true,
    "run_events_sse": true,
    "run_stop": true,
    "run_approval": true
  }
}
```

The document can contain additional fields; clients must ignore fields they do not understand.

## Runs API

### Create a run: `POST /v1/runs`

Request:

```json
{
  "input": "Hello Hermes",
  "session_id": "optional-mobile-session-id"
}
```

`input` is required. Hermes also supports optional instructions, conversation history, and
previous-response chaining; those are deferred until the basic mobile flow is stable.

Success is HTTP `202`:

```json
{"run_id":"run_abc123","status":"started"}
```

The mobile client maps `run_id` to `runId` internally but preserves the server value in URLs.

### Stream events: `GET /v1/runs/{run_id}/events`

The response is `text/event-stream` and consists of blank-line-delimited SSE records. Keepalive
comments must be ignored:

```text
: keepalive

```

JSON records use a top-level `event` field. The first slice supports:

```json
{"event":"message.delta","run_id":"run_abc123","delta":"Hello"}
{"event":"tool.started","run_id":"run_abc123","tool":"terminal","preview":"…"}
{"event":"tool.completed","run_id":"run_abc123","tool":"terminal","duration":0.42,"error":false}
{"event":"reasoning.available","run_id":"run_abc123","text":"…"}
{"event":"approval.request","run_id":"run_abc123","command":"…","choices":["once","session","deny"]}
{"event":"approval.responded","run_id":"run_abc123","choice":"once","resolved":1}
{"event":"run.completed","run_id":"run_abc123","output":"final answer","usage":{}}
{"event":"run.failed","run_id":"run_abc123","error":"safe error text"}
{"event":"run.cancelled","run_id":"run_abc123"}
```

The upstream server redacts sensitive approval command content before it enters the event stream.
The mobile client does not attempt to reconstruct or execute commands.

### Stop: `POST /v1/runs/{run_id}/stop`

The endpoint is intentionally cooperative and returns immediately:

```json
{"run_id":"run_abc123","status":"stopping"}
```

The eventual SSE terminal event determines whether the run becomes cancelled or otherwise
settles. The client must not claim completion from the stop response alone.

### Resolve approval: `POST /v1/runs/{run_id}/approval`

Only choices advertised by the pending event are shown. The supported body is:

```json
{"choice":"once","resolve_all":false}
```

Allowed choices are `once`, `session`, `always`, and `deny`; Hermes also accepts the documented
approval aliases. The first mobile UI will default dismissal to `deny` and will not permit command
editing.

## Session endpoints used by the next slice

All are bearer-authenticated:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/sessions` | List sessions, newest activity first |
| `POST` | `/api/sessions` | Create an empty session (`id`/`title` optional) |
| `GET` | `/api/sessions/{id}/messages` | Load persisted message history |
| `POST` | `/api/sessions/{id}/chat/stream` | Session-persisted streaming chat (deferred) |

List responses use an object/list envelope:

```json
{"object":"list","data":[],"limit":50,"offset":0,"has_more":false}
```

Message history uses:

```json
{"object":"list","session_id":"session-id","data":[]}
```

Unknown fields must be ignored for forward compatibility.

## Error normalization

HTTP errors are normalized into a client-side `HermesApiError` containing:

- `status`: HTTP status code;
- `code`: server error code when supplied; and
- `message`: a safe server message or generic status text.

Bearer keys are never included in URLs, error text, snapshots, or logs.

## Deterministic fixture

`mobile/tests/fixtures/fake-hermes-server.ts` implements this contract without a provider. It
supports normal, approval, failure, cancellation, session, stop, and chunked-SSE scenarios. The
fixture-only tests run with:

```bash
cd mobile
npm run test:run -- src/lib/__tests__/fake-hermes-server.test.ts
```

A real Android/Termux acceptance test is still required before claiming device support.
