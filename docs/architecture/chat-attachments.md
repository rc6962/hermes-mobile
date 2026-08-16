# Chat attachments: JPEG/PNG, PDF, and Word

## Product requirement

Hermes Mobile chat must provide a **+** control beside the composer and accept pasted images.
Initial accepted types are:

- JPEG (`image/jpeg`);
- PNG (`image/png`);
- PDF (`application/pdf`);
- Microsoft Word (`.doc` and `.docx`).

This is a privacy-first feature. The initial consumer product must not require a cloud file store or expose an arbitrary Android filesystem picker to Hermes tools.

## Current constraint

The mobile client currently calls `POST /v1/runs` with a text-only `input` string. Its pinned contract contains no attachment field or upload endpoint. The documented upstream API accepts inline image content for multimodal model requests, but explicitly rejects generic `file`, `input_file`, and `file_id` inputs.

Therefore a visual picker alone is not a completed feature. The runtime adapter must explicitly advertise and implement attachment ingestion before Hermes Mobile sends a selected item.

## Proposed runtime capability contract

`GET /v1/capabilities` adds optional fields. Mobile must hide or disable a capability that is absent or false.

```json
{
  "features": {
    "run_submission": true,
    "inline_image_input": true,
    "local_document_ingestion": true
  },
  "attachments": {
    "image_types": ["image/jpeg", "image/png"],
    "document_types": ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    "max_file_bytes": 10485760,
    "max_document_text_chars": 100000
  }
}
```

The client must not infer support merely because the file picker can select a file.

## Image flow

1. The user selects a JPEG/PNG with **+** or pastes it into the message field.
2. The mobile client validates MIME type, byte limit, and image decode success before sending.
3. It creates a local preview only; preview data is never put in logs, titles, or session navigation.
4. On send, the adapter receives a structured image content part alongside the text message.
5. The adapter validates the bounded image payload and passes the native `image_url` data URL/content block only to a vision-capable provider.
6. If the active model lacks vision, the user receives a clear pre-send error and can change models or remove the image.

The initial limit is **10 MiB per image**. The adapter owns final server-side enforcement.

## Document flow

PDF, DOC, and DOCX must not be represented as base64 inside chat text or sent through an unrestricted upload endpoint.

1. The user selects a document with **+**.
2. The mobile client validates the filename, MIME type, and the advertised server limit.
3. The loopback runtime ingests the document under an opaque, per-run attachment identifier.
4. The runtime extracts bounded text locally and returns safe metadata only: display name, detected type, page/section count when available, truncation state, and a generated attachment identifier.
5. The run request references the opaque attachment identifier. Hermes receives the extracted text and metadata as explicit context, never a permissive filesystem path.
6. The local ingest record is removed when the run settles unless the user explicitly chooses to retain it in a future feature.

Initial limits:

- **10 MiB per document**;
- **100,000 extracted characters** per document;
- one document or image attachment per first implementation slice.

### Format handling

| Format | Required behavior |
|---|---|
| PDF | Extract embedded text. If the PDF is scanned/no text is available, report that OCR is not yet enabled rather than fabricate content. |
| DOCX | Extract document text/structure locally. |
| DOC | Attempt local legacy-Word extraction only when the runtime has an approved extractor. Otherwise explain that conversion to DOCX/PDF is required. |

The selected `.doc` format remains accepted by the UI, but the runtime must state its actual parser capability. This avoids falsely promising legacy Word support on a Termux runtime that does not contain an extractor.

## Proposed endpoints

The exact endpoint names may change with the shared runtime-adapter API, but the security boundary is mandatory.

```text
POST /v1/attachments/documents
Content-Type: multipart/form-data
Authorization: Bearer <local key>

POST /v1/runs
{
  "input": [
    {"type":"text", "text":"Please summarize this"},
    {"type":"image_url", "image_url":{"url":"data:image/png;base64,..."}}
  ],
  "attachment_ids": ["att_local_..."],
  "session_id": "optional-mobile-session-id"
}
```

Rules:

- only the advertised MIME types are accepted;
- attachment identifiers are opaque and scoped to the authenticated local session/run;
- no provider key, local file path, raw document text, or raw image bytes appear in logs/SSE previews;
- `multipart/form-data` is used only for document ingestion, never to create a general-purpose file server;
- the mobile client never uploads a file until the capability response confirms that route and format;
- the existing text-only request remains backward-compatible.

## UX acceptance criteria

- A visible **+** button is available beside the composer when chat is ready.
- It opens Android-safe image/file selection and allows JPEG, PNG, PDF, DOC, and DOCX.
- Pasting a JPEG/PNG into the composer creates an attachment chip/preview.
- Every selected attachment exposes name, type, size, remove action, and readiness/error state.
- Sending is disabled only when an attachment is invalid or unsupported by the current runtime/model; normal text-only chat remains unaffected.
- The screen explains why a file cannot be sent and never silently drops an attachment.
- No unrestricted shell/filesystem access is granted to Hermes as part of this feature.

## Delivery decision

The attachment-capable runtime adapter will be implemented as **versioned source in this repository** and tested independently before any S24 installation. It is a shared adapter boundary for the current optional Termux runtime and the future managed/self-contained runtime; it is not a Termux-only patch.

The adapter uses advertised capability metadata and bounded format-specific ingestion. Future attachment types must add an explicit MIME allowlist entry, local normalizer/extractor, validation, capability flag, and tests. They must not require a rewrite of the chat composer, session schema, or model/provider architecture.

## Local adapter client contract

`mobile/src/lib/attachment-adapter-client.ts` is the mobile client for the local attachment adapter (`attachment-adapter/`). It mirrors the adapter's HTTP contract and is the only way the chat UI learns about or uses local document ingestion:

- `createAttachmentAdapterClient({ baseUrl, apiKey, fetchImpl })` returns `capabilities()` (`GET /v1/capabilities`) and `intakeDocument(runId, file)` (`POST /v1/attachments/documents`, multipart with `run_id` + `file`).
- `negotiateDocumentSend(state, capabilities, mimeType)` derives the document send decision purely from advertised state: `idle` (no adapter connected), `loading`, `unavailable`, `unsupported-format` (per-MIME `document_intake`), `intake-only` (`attachment_run_delivery` false), or `ready`.
- `documentSendBlockReason(...)` turns every non-`ready` state into an explicit composer message. The client never silently drops a file and never claims a route exists that the adapter did not advertise.

`ChatView` accepts an optional `attachmentAdapter` prop. When it is absent, documents are blocked with the idle message. When it is present, the composer gates each document on the negotiation result; only `ready` enables send. On send in the `ready` state the documents are ingested through the adapter (scoped to the current session, or `mobile-unsaved-session` before a session exists), and the run request references the returned opaque `attachment_ids` instead of file paths or base64 text.

The current adapter advertises `attachment_run_delivery: false` and `inline_image_input: false`, so in practice: images still travel inline through the Hermes run transport (gated on the Hermes runtime's `inline_image_input`), and documents are ingestible but blocked from run delivery with an explicit message. App-level wiring of the adapter client is pending a deployment decision on the adapter base URL and credential slot; until then the prop-level contract and its tests are the deliverable.

## Delivery order

1. Define and test the attachment payload/capability types in the frontend and fixture.
2. Add the **+** picker, image paste handling, attachment chips, and validation with test coverage.
3. Extend the shared runtime adapter with image content blocks and local PDF/DOC/DOCX ingestion.
4. Capability-gate attachment send in both Termux and managed adapters.
5. Verify text, JPEG, PNG, PDF, DOCX, and legacy DOC success/failure paths on the S24 Ultra without recording user document/image data.
