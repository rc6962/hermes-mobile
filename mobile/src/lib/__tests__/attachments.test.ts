import { describe, expect, it } from "vitest";

import { validateAttachmentFile } from "../attachments";

describe("validateAttachmentFile", () => {
  it.each([
    ["photo.jpg", "image/jpeg"],
    ["photo.png", "image/png"],
    ["report.pdf", "application/pdf"],
    ["legacy.doc", "application/msword"],
    ["report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ])("accepts %s", (name, type) => {
    const expectedKind = type.startsWith("image/") ? "image" : "document";
    expect(validateAttachmentFile(new File(["content"], name, { type }))).toEqual({
      ok: true,
      kind: expectedKind,
    });
  });

  it("rejects unsupported file types", () => {
    expect(validateAttachmentFile(new File(["content"], "script.exe", { type: "application/octet-stream" }))).toMatchObject({
      ok: false,
      reason: "unsupported-type",
    });
  });

  it("rejects files larger than the bounded attachment limit", () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" });
    expect(validateAttachmentFile(file)).toMatchObject({ ok: false, reason: "too-large" });
  });
});
