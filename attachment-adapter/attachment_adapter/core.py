"""Core policy, bounded document normalization, and scoped attachment storage."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import re
from secrets import token_urlsafe
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

ADAPTER_VERSION = "1.0"
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_DOCUMENT_TEXT_CHARS = 100_000
MAX_DOCX_XML_BYTES = 4 * 1024 * 1024
IMAGE_TYPES = ("image/jpeg", "image/png")
DOCUMENT_TYPES = (
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
)
DOCX_TYPE = DOCUMENT_TYPES[2]


class AttachmentValidationError(ValueError):
    """Raised when an attachment violates the local adapter policy."""


@dataclass(frozen=True)
class NormalizedDocument:
    text: str
    truncated: bool
    sections: int


@dataclass(frozen=True)
class AttachmentRecord:
    attachment_id: str
    run_id: str
    name: str
    mime_type: str
    content: bytes
    document: NormalizedDocument | None = None


def capabilities() -> dict[str, object]:
    return {
        "object": "hermes.attachment_adapter.capabilities",
        "adapter_version": ADAPTER_VERSION,
        "auth": {"type": "bearer", "required": True},
        "features": {
            "inline_image_input": False,
            "local_document_ingestion": True,
            "attachment_run_delivery": False,
        },
        "attachments": {
            "image_types": list(IMAGE_TYPES),
            "document_types": list(DOCUMENT_TYPES),
            "document_intake": {
                "application/pdf": True,
                "application/msword": False,
                DOCX_TYPE: True,
            },
            "max_file_bytes": MAX_FILE_BYTES,
            "max_document_text_chars": MAX_DOCUMENT_TEXT_CHARS,
        },
    }


def _bounded(text: str) -> NormalizedDocument:
    normalized = "\n".join(line.strip() for line in text.splitlines() if line.strip())
    truncated = len(normalized) > MAX_DOCUMENT_TEXT_CHARS
    value = normalized[:MAX_DOCUMENT_TEXT_CHARS]
    return NormalizedDocument(value, truncated, max(1, value.count("\n") + 1) if value else 0)


def _extract_docx(content: bytes) -> NormalizedDocument:
    try:
        with ZipFile(BytesIO(content)) as archive:
            try:
                info = archive.getinfo("word/document.xml")
            except KeyError as error:
                raise AttachmentValidationError("DOCX has no word/document.xml") from error
            if info.file_size > MAX_DOCX_XML_BYTES:
                raise AttachmentValidationError("DOCX document XML exceeds extraction limit")
            xml = archive.read(info)
    except (BadZipFile, OSError) as error:
        raise AttachmentValidationError("invalid DOCX container") from error
    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError as error:
        raise AttachmentValidationError("invalid DOCX document XML") from error
    text = "\n".join(node.text or "" for node in root.iter() if node.tag.endswith("}t"))
    if not text.strip():
        raise AttachmentValidationError("DOCX contains no extractable text")
    return _bounded(text)


def _extract_pdf(content: bytes) -> NormalizedDocument:
    if not content.startswith(b"%PDF-"):
        raise AttachmentValidationError("invalid PDF signature")
    # Conservative standard-library fallback: extract only literal strings from
    # text-showing operators. It intentionally does not OCR or decompress streams.
    values = re.findall(rb"\(([^()]{1,4096})\)\s*T[Jj]", content)
    text = "\n".join(value.replace(rb"\(", b"(").replace(rb"\)", b")").decode("latin-1") for value in values)
    if not text.strip():
        raise AttachmentValidationError("PDF has no extractable embedded text; OCR is not enabled")
    return _bounded(text)


def normalize_document(mime_type: str, content: bytes) -> NormalizedDocument:
    if mime_type == "application/pdf":
        return _extract_pdf(content)
    if mime_type == DOCX_TYPE:
        return _extract_docx(content)
    if mime_type == "application/msword":
        raise AttachmentValidationError("legacy DOC extraction is unavailable; convert to DOCX or PDF")
    raise AttachmentValidationError("unsupported document MIME type")


class AttachmentStore:
    def __init__(self, *, max_file_bytes: int = MAX_FILE_BYTES) -> None:
        self.max_file_bytes = max_file_bytes
        self._records: dict[str, AttachmentRecord] = {}

    def add(self, name: str, mime_type: str, content: bytes, *, run_id: str) -> AttachmentRecord:
        if mime_type not in IMAGE_TYPES + DOCUMENT_TYPES:
            raise AttachmentValidationError("unsupported MIME type")
        if not content:
            raise AttachmentValidationError("attachment is empty")
        if len(content) > self.max_file_bytes:
            raise AttachmentValidationError("attachment exceeds maximum size")
        if not run_id or len(run_id) > 128 or not re.fullmatch(r"[A-Za-z0-9._:-]+", run_id):
            raise AttachmentValidationError("invalid run scope")
        safe_name = name.replace("\\", "/").rsplit("/", 1)[-1].strip()
        if not safe_name or len(safe_name) > 255:
            raise AttachmentValidationError("invalid attachment name")
        document = normalize_document(mime_type, content) if mime_type in DOCUMENT_TYPES else None
        attachment_id = f"att_local_{token_urlsafe(18)}"
        record = AttachmentRecord(attachment_id, run_id, safe_name, mime_type, content, document)
        self._records[attachment_id] = record
        return record

    def get(self, attachment_id: str, *, run_id: str) -> AttachmentRecord | None:
        record = self._records.get(attachment_id)
        return record if record and record.run_id == run_id else None

    def cleanup(self, run_id: str) -> None:
        for attachment_id, record in list(self._records.items()):
            if record.run_id == run_id:
                del self._records[attachment_id]

    def count(self) -> int:
        return len(self._records)
