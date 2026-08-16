import type { FetchImplementation } from "./hermes-api";

/**
 * Versioned client for the local attachment adapter (attachment-adapter/).
 *
 * The adapter is an authenticated loopback HTTP service that advertises its
 * real capabilities and owns local document ingestion. The mobile client must
 * never assume a route or format exists: every document send path is derived
 * from `GET /v1/capabilities`, and unsupported runtime behavior is reported
 * explicitly instead of being silently dropped.
 *
 * Contract (mirrors attachment-adapter/attachment_adapter/server.py):
 * - GET  /v1/capabilities            -> AttachmentAdapterCapabilities
 * - POST /v1/attachments/documents   -> AttachmentIntakeResult (multipart)
 *
 * The adapter currently advertises `attachment_run_delivery: false` and
 * `inline_image_input: false`. Images therefore stay on the inline Hermes run
 * path (never through this adapter), and documents can be ingested locally but
 * are not delivered into a run until a future adapter advertises run delivery.
 */

export type AttachmentAdapterState = "idle" | "loading" | "ready" | "unavailable";

export type AttachmentDelivery = "intake_only" | "run_delivery";

export interface AttachmentAdapterCapabilities {
  object?: string;
  adapter_version: string;
  auth?: { type?: string; required?: boolean };
  features: {
    inline_image_input: boolean;
    local_document_ingestion: boolean;
    attachment_run_delivery: boolean;
  };
  attachments: {
    image_types: string[];
    document_types: string[];
    document_intake: Record<string, boolean>;
    max_file_bytes: number;
    max_document_text_chars: number;
  };
}

export interface AttachmentIntakeResult {
  object: "hermes.attachment";
  attachment_id: string;
  name: string;
  mime_type: string;
  text_chars: number;
  sections: number;
  truncated: boolean;
  delivery: AttachmentDelivery;
}

export interface AttachmentAdapterClient {
  capabilities(): Promise<AttachmentAdapterCapabilities>;
  intakeDocument(runId: string, file: File): Promise<AttachmentIntakeResult>;
}

export class AttachmentAdapterError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AttachmentAdapterError";
    this.status = status;
    this.code = code;
  }
}

interface JsonErrorBody {
  error?: {
    code?: unknown;
    message?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isDelivery(value: unknown): value is AttachmentDelivery {
  return value === "intake_only" || value === "run_delivery";
}

async function adapterErrorFromResponse(response: Response): Promise<AttachmentAdapterError> {
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    body = undefined;
  }

  const error = isRecord(body) ? (body as JsonErrorBody).error : undefined;
  const code = isRecord(error) && typeof error.code === "string" ? error.code : "request_failed";
  const message =
    isRecord(error) && typeof error.message === "string"
      ? error.message
      : `Attachment adapter request failed with HTTP ${response.status}`;

  return new AttachmentAdapterError(response.status, code, message);
}

/** Fail closed: a capabilities document without the contract fields is not usable. */
export function normalizeAdapterCapabilities(value: unknown): AttachmentAdapterCapabilities {
  if (
    !isRecord(value) ||
    !isRecord(value.features) ||
    !isRecord(value.attachments) ||
    !isRecord(value.attachments.document_intake)
  ) {
    throw new AttachmentAdapterError(
      502,
      "invalid_capabilities",
      "The attachment adapter returned an invalid capabilities document.",
    );
  }
  return value as unknown as AttachmentAdapterCapabilities;
}

/** Fail closed: an intake response without the contract fields is not usable. */
export function normalizeIntakeResult(value: unknown): AttachmentIntakeResult {
  if (
    !isRecord(value) ||
    typeof value.attachment_id !== "string" ||
    typeof value.name !== "string" ||
    !isDelivery(value.delivery)
  ) {
    throw new AttachmentAdapterError(
      502,
      "invalid_intake_response",
      "The attachment adapter returned an invalid intake response.",
    );
  }
  return value as unknown as AttachmentIntakeResult;
}

export interface AttachmentAdapterClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: FetchImplementation;
}

export function createAttachmentAdapterClient(
  options: AttachmentAdapterClientOptions,
): AttachmentAdapterClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  const authHeaders = (): Record<string, string> =>
    options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {};

  return {
    async capabilities(): Promise<AttachmentAdapterCapabilities> {
      const response = await fetchImpl(`${baseUrl}/v1/capabilities`, {
        method: "GET",
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw await adapterErrorFromResponse(response);
      }
      return normalizeAdapterCapabilities(await response.json());
    },

    async intakeDocument(runId: string, file: File): Promise<AttachmentIntakeResult> {
      const form = new FormData();
      form.append("run_id", runId);
      form.append("file", file, file.name);
      // The browser sets the multipart/form-data boundary; do not set
      // Content-Type manually.
      const response = await fetchImpl(`${baseUrl}/v1/attachments/documents`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      if (!response.ok) {
        throw await adapterErrorFromResponse(response);
      }
      return normalizeIntakeResult(await response.json());
    },
  };
}

/**
 * Document send status for the mobile path, derived solely from what the local
 * adapter actually advertises. `ready` is the only state in which a document
 * may be ingested and referenced from a run.
 */
export type DocumentNegotiation =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "unavailable" }
  | { state: "unsupported-format" }
  | { state: "intake-only" }
  | { state: "ready" };

export function negotiateDocumentSend(
  state: AttachmentAdapterState,
  capabilities: AttachmentAdapterCapabilities | undefined,
  mimeType: string,
): DocumentNegotiation {
  if (state === "idle") {
    return { state: "idle" };
  }
  if (state === "loading") {
    return { state: "loading" };
  }
  if (state === "unavailable") {
    return { state: "unavailable" };
  }
  if (
    !capabilities?.features?.local_document_ingestion ||
    !capabilities.attachments?.document_intake?.[mimeType]
  ) {
    return { state: "unsupported-format" };
  }
  if (!capabilities.features.attachment_run_delivery) {
    return { state: "intake-only" };
  }
  return { state: "ready" };
}

/** Explicit, bounded block reason for the composer, or undefined when sendable. */
export function documentSendBlockReason(
  negotiation: DocumentNegotiation,
  fileName: string,
): string | undefined {
  switch (negotiation.state) {
    case "ready":
      return undefined;
    case "idle":
      return "Document sending is not connected to a local document service yet. Remove the document to send this message.";
    case "loading":
      return "Checking local document support…";
    case "unavailable":
      return "The local document service is unavailable. Remove the document to send this message.";
    case "unsupported-format":
      return `${fileName} is not supported by the local document service. Remove the document to send this message.`;
    case "intake-only":
      return "The local document service can ingest documents but cannot deliver them into a Hermes run yet. Remove the document to send this message.";
  }
}
