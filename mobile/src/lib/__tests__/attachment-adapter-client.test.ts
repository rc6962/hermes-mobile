import { describe, expect, it, vi } from "vitest";

import {
  AttachmentAdapterError,
  createAttachmentAdapterClient,
  documentSendBlockReason,
  negotiateDocumentSend,
  normalizeAdapterCapabilities,
  normalizeIntakeResult,
  type AttachmentAdapterCapabilities,
  type DocumentNegotiation,
} from "../attachment-adapter-client";

const ADAPTER_CAPABILITIES: AttachmentAdapterCapabilities = {
  object: "balls.attachment_adapter.capabilities",
  adapter_version: "1.0",
  auth: { type: "bearer", required: true },
  features: {
    inline_image_input: false,
    local_document_ingestion: true,
    attachment_run_delivery: false,
  },
  attachments: {
    image_types: ["image/jpeg", "image/png"],
    document_types: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    document_intake: {
      "application/pdf": true,
      "application/msword": false,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
    },
    max_file_bytes: 10 * 1024 * 1024,
    max_document_text_chars: 100_000,
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("normalizeAdapterCapabilities", () => {
  it("accepts the adapter contract and rejects malformed documents", () => {
    const normalized = normalizeAdapterCapabilities(ADAPTER_CAPABILITIES);
    expect(normalized.adapter_version).toBe("1.0");
    expect(normalized.attachments.document_intake["application/pdf"]).toBe(true);
    expect(() => normalizeAdapterCapabilities(null)).toThrow(AttachmentAdapterError);
    expect(() => normalizeAdapterCapabilities({ features: {} })).toThrow(/invalid capabilities/i);
  });
});

describe("normalizeIntakeResult", () => {
  it("accepts intake metadata and rejects content-bearing or malformed responses", () => {
    const result = normalizeIntakeResult({
      object: "balls.attachment",
      attachment_id: "att_local_abc",
      name: "report.pdf",
      mime_type: "application/pdf",
      text_chars: 12,
      sections: 1,
      truncated: false,
      delivery: "intake_only",
    });
    expect(result.attachment_id).toBe("att_local_abc");
    expect(result.delivery).toBe("intake_only");
    expect(() => normalizeIntakeResult({ ...result, delivery: "full_content" })).toThrow(
      /invalid intake response/i,
    );
  });
});

describe("createAttachmentAdapterClient", () => {
  it("fetches capabilities with bearer authentication", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(ADAPTER_CAPABILITIES));
    const client = createAttachmentAdapterClient({
      baseUrl: "http://127.0.0.1:8765",
      apiKey: "secret",
      fetchImpl,
    });

    await expect(client.capabilities()).resolves.toMatchObject({ adapter_version: "1.0" });
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:8765/v1/capabilities", {
      method: "GET",
      headers: { Authorization: "Bearer secret" },
    });
  });

  it("surfaces typed adapter errors with code and message", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { code: "invalid_attachment", message: "convert to DOCX" } }, 400),
    );
    const client = createAttachmentAdapterClient({
      baseUrl: "http://127.0.0.1:8765",
      apiKey: "secret",
      fetchImpl,
    });

    const error = await client.capabilities().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(AttachmentAdapterError);
    expect((error as AttachmentAdapterError).status).toBe(400);
    expect((error as AttachmentAdapterError).code).toBe("invalid_attachment");
    expect((error as AttachmentAdapterError).message).toContain("convert to DOCX");
  });

  it("maps a non-JSON failure to a generic typed error", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 502 }));
    const client = createAttachmentAdapterClient({
      baseUrl: "http://127.0.0.1:8765",
      apiKey: "secret",
      fetchImpl,
    });

    const error = await client.capabilities().catch((value: unknown) => value);
    expect((error as AttachmentAdapterError).code).toBe("request_failed");
    expect((error as AttachmentAdapterError).message).toContain("HTTP 502");
  });

  it("intakes a document as multipart form data scoped to the run", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return jsonResponse(
          {
            object: "balls.attachment",
            attachment_id: "att_local_xyz",
            name: "report.pdf",
            mime_type: "application/pdf",
            text_chars: 12,
            sections: 1,
            truncated: false,
            delivery: "intake_only",
          },
          201,
        );
      },
    );
    const client = createAttachmentAdapterClient({
      baseUrl: "http://127.0.0.1:8765/",
      apiKey: "secret",
      fetchImpl,
    });
    const file = new File(["%PDF"], "report.pdf", { type: "application/pdf" });

    const result = await client.intakeDocument("run-1", file);

    expect(result.attachment_id).toBe("att_local_xyz");
    expect(result.delivery).toBe("intake_only");
    const call = fetchImpl.mock.calls[0]!;
    expect(String(call[0])).toBe("http://127.0.0.1:8765/v1/attachments/documents");
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer secret" });
    const body = init.body as FormData;
    expect(body.get("run_id")).toBe("run-1");
    const part = body.get("file") as File;
    expect(part.name).toBe("report.pdf");
    expect(part.type).toBe("application/pdf");
  });

  it("throws a typed error when document intake is rejected", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { error: { code: "invalid_attachment", message: "invalid PDF signature" } },
        400,
      ),
    );
    const client = createAttachmentAdapterClient({
      baseUrl: "http://127.0.0.1:8765",
      apiKey: "secret",
      fetchImpl,
    });

    const error = await client
      .intakeDocument("run-1", new File(["nope"], "scan.pdf", { type: "application/pdf" }))
      .catch((value: unknown) => value);
    expect((error as AttachmentAdapterError).code).toBe("invalid_attachment");
    expect((error as AttachmentAdapterError).message).toContain("invalid PDF signature");
  });
});

describe("negotiateDocumentSend", () => {
  const pdfMime = "application/pdf";
  const docMime = "application/msword";

  it("reports idle/loading/unavailable states without advertising support", () => {
    expect(negotiateDocumentSend("idle", ADAPTER_CAPABILITIES, pdfMime)).toEqual({ state: "idle" });
    expect(negotiateDocumentSend("loading", undefined, pdfMime)).toEqual({ state: "loading" });
    expect(negotiateDocumentSend("unavailable", ADAPTER_CAPABILITIES, pdfMime)).toEqual({
      state: "unavailable",
    });
  });

  it("reports unsupported formats from the adapter's document_intake map", () => {
    expect(negotiateDocumentSend("ready", ADAPTER_CAPABILITIES, docMime)).toEqual({
      state: "unsupported-format",
    });
    expect(negotiateDocumentSend("ready", ADAPTER_CAPABILITIES, "image/png")).toEqual({
      state: "unsupported-format",
    });
  });

  it("reports intake-only when the adapter cannot deliver into a run", () => {
    expect(negotiateDocumentSend("ready", ADAPTER_CAPABILITIES, pdfMime)).toEqual({
      state: "intake-only",
    });
  });

  it("reports ready only when intake and run delivery are both advertised", () => {
    const deliveryCaps: AttachmentAdapterCapabilities = {
      ...ADAPTER_CAPABILITIES,
      features: { ...ADAPTER_CAPABILITIES.features, attachment_run_delivery: true },
    };
    expect(negotiateDocumentSend("ready", deliveryCaps, pdfMime)).toEqual({ state: "ready" });
  });
});

describe("documentSendBlockReason", () => {
  const cases: Array<[DocumentNegotiation, RegExp]> = [
    [{ state: "idle" }, /not connected to a local document service/i],
    [{ state: "loading" }, /checking local document support/i],
    [{ state: "unavailable" }, /local document service is unavailable/i],
    [{ state: "unsupported-format" }, /not supported by the local document service/i],
    [{ state: "intake-only" }, /cannot deliver them into a balls run/i],
  ];

  it.each(cases)("explains %j without silently dropping the file", (negotiation, pattern) => {
    expect(documentSendBlockReason(negotiation, "report.pdf")).toMatch(pattern);
  });

  it("names the file in the unsupported-format reason", () => {
    expect(documentSendBlockReason({ state: "unsupported-format" }, "report.pdf")).toContain(
      "report.pdf",
    );
  });

  it("returns undefined only when delivery is ready", () => {
    expect(documentSendBlockReason({ state: "ready" }, "report.pdf")).toBeUndefined();
  });
});
