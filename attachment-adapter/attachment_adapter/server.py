"""Versioned authenticated HTTP boundary for the local attachment adapter."""
from __future__ import annotations

from email import policy
from email.parser import BytesParser
from hmac import compare_digest
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .core import MAX_FILE_BYTES, AttachmentStore, AttachmentValidationError, capabilities

MAX_MULTIPART_OVERHEAD = 64 * 1024


class AttachmentHandler(BaseHTTPRequestHandler):
    store = AttachmentStore()
    api_key = ""

    def log_message(self, format: str, *args: object) -> None:
        # Do not place filenames, multipart bodies, or attachment data in logs.
        return

    def _json(self, body: Any, status: int = 200) -> None:
        encoded = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def _authorized(self) -> bool:
        expected = f"Bearer {self.api_key}"
        supplied = self.headers.get("Authorization", "")
        return bool(self.api_key) and compare_digest(supplied, expected)

    def _require_auth(self) -> bool:
        if self._authorized():
            return True
        self._json({"error": {"code": "unauthorized", "message": "valid bearer authentication is required"}}, 401)
        return False

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/v1/capabilities":
            self._json({"error": {"code": "not_found"}}, 404)
            return
        if self._require_auth():
            self._json(capabilities())

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/v1/attachments/documents":
            self._json({"error": {"code": "not_found"}}, 404)
            return
        if not self._require_auth():
            return
        try:
            content_length = int(self.headers.get("Content-Length", "-1"))
            if content_length < 0 or content_length > MAX_FILE_BYTES + MAX_MULTIPART_OVERHEAD:
                self._json({"error": {"code": "payload_too_large"}}, 413)
                return
            content_type = self.headers.get("Content-Type", "")
            if not content_type.lower().startswith("multipart/form-data") or "boundary=" not in content_type.lower():
                raise AttachmentValidationError("multipart/form-data with a boundary is required")
            body = self.rfile.read(content_length)
            message = BytesParser(policy=policy.default).parsebytes(
                f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode() + body
            )
            file_part = None
            run_id = ""
            for part in message.iter_parts():
                field_name = part.get_param("name", header="Content-Disposition")
                if field_name == "run_id":
                    run_id = part.get_content().strip()
                elif field_name == "file":
                    if file_part is not None:
                        raise AttachmentValidationError("exactly one file is required")
                    file_part = part
            if file_part is None:
                raise AttachmentValidationError("file and run_id are required")
            content = file_part.get_payload(decode=True) or b""
            record = self.store.add(
                file_part.get_filename() or "attachment",
                file_part.get_content_type() or "",
                content,
                run_id=run_id,
            )
            document = record.document
            self._json({
                "object": "hermes.attachment",
                "attachment_id": record.attachment_id,
                "name": record.name,
                "mime_type": record.mime_type,
                "text_chars": len(document.text) if document else 0,
                "sections": document.sections if document else 0,
                "truncated": document.truncated if document else False,
                "delivery": "intake_only",
            }, 201)
        except (KeyError, AttachmentValidationError, ValueError) as error:
            self._json({"error": {"code": "invalid_attachment", "message": str(error)}}, 400)


def serve(host: str = "127.0.0.1", port: int = 8765, api_key: str = "") -> ThreadingHTTPServer:
    class ConfiguredAttachmentHandler(AttachmentHandler):
        store = AttachmentStore()

    ConfiguredAttachmentHandler.api_key = api_key
    return ThreadingHTTPServer((host, port), ConfiguredAttachmentHandler)
