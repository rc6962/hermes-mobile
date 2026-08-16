export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type AttachmentKind = "image" | "document";
export interface PendingAttachment {
  id: string;
  file: File;
  kind: AttachmentKind;
}

export type AttachmentValidationReason = "unsupported-type" | "too-large";

export interface AttachmentValidationSuccess {
  ok: true;
  kind: AttachmentKind;
}

export interface AttachmentValidationFailure {
  ok: false;
  reason: AttachmentValidationReason;
}

export type AttachmentValidation = AttachmentValidationSuccess | AttachmentValidationFailure;

const imageTypes = new Set(["image/jpeg", "image/png"]);
const documentTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function extensionOf(name: string): string {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

const extensionTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function attachmentMimeType(file: File): string {
  return file.type.toLowerCase() || extensionTypes[extensionOf(file.name)] || "";
}

export function validateAttachmentFile(file: File): AttachmentValidation {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: "too-large" };
  }

  const type = attachmentMimeType(file);
  const extension = extensionOf(file.name);
  if (imageTypes.has(type) || (type === "" && [".jpg", ".jpeg", ".png"].includes(extension))) {
    return { ok: true, kind: "image" };
  }
  if (
    documentTypes.has(type) ||
    (type === "" && [".pdf", ".doc", ".docx"].includes(extension))
  ) {
    return { ok: true, kind: "document" };
  }

  return { ok: false, reason: "unsupported-type" };
}

export function attachmentDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error(`Could not read ${file.name}`));
    };
    reader.readAsDataURL(file);
  });
}
