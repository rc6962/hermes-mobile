import io
import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from zipfile import ZIP_DEFLATED, ZipFile

from attachment_adapter.core import (
    DOCX_TYPE,
    AttachmentStore,
    AttachmentValidationError,
    capabilities,
    normalize_document,
)
from attachment_adapter.server import serve


def pdf_with_text(text: str = "bounded text") -> bytes:
    return f"%PDF-1.4\n1 0 obj\nBT ({text}) TJ ET\nendobj\n%%EOF".encode("latin-1")


def docx_with_text(text: str = "hello docx") -> bytes:
    output = io.BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr(
            "word/document.xml",
            '<?xml version="1.0"?><w:document xmlns:w="urn:w"><w:body>'
            f"<w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>",
        )
    return output.getvalue()


def multipart(run_id: str, name: str, mime_type: str, content: bytes) -> tuple[bytes, str]:
    boundary = "----HermesAttachmentBoundary"
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"run_id\"\r\n\r\n{run_id}\r\n"
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\n"
        f"Content-Type: {mime_type}\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


class AttachmentCoreTests(unittest.TestCase):
    def test_capabilities_are_versioned_and_honest_about_delivery_and_formats(self):
        data = capabilities()
        self.assertEqual(data["adapter_version"], "1.0")
        self.assertEqual(data["auth"], {"type": "bearer", "required": True})
        self.assertFalse(data["features"]["inline_image_input"])
        self.assertFalse(data["features"]["attachment_run_delivery"])
        self.assertTrue(data["features"]["local_document_ingestion"])
        self.assertTrue(data["attachments"]["document_intake"]["application/pdf"])
        self.assertFalse(data["attachments"]["document_intake"]["application/msword"])

    def test_store_normalizes_pdf_and_returns_scoped_opaque_id(self):
        store = AttachmentStore()
        record = store.add("report.pdf", "application/pdf", pdf_with_text(), run_id="run-1")
        self.assertTrue(record.attachment_id.startswith("att_local_"))
        self.assertEqual(record.document.text, "bounded text")
        self.assertIsNone(store.get(record.attachment_id, run_id="run-2"))

    def test_docx_uses_bounded_standard_library_extraction(self):
        normalized = normalize_document(DOCX_TYPE, docx_with_text("safe local text"))
        self.assertEqual(normalized.text, "safe local text")
        self.assertFalse(normalized.truncated)

    def test_rejects_invalid_pdf_docx_and_legacy_doc_without_retention(self):
        store = AttachmentStore()
        cases = [
            ("scan.pdf", "application/pdf", b"not pdf", "invalid PDF"),
            ("empty.pdf", "application/pdf", b"%PDF-1.4\n%%EOF", "OCR is not enabled"),
            ("broken.docx", DOCX_TYPE, b"not zip", "invalid DOCX"),
            ("legacy.doc", "application/msword", b"doc", "convert to DOCX"),
        ]
        for name, mime_type, content, message in cases:
            with self.subTest(name=name), self.assertRaisesRegex(AttachmentValidationError, message):
                store.add(name, mime_type, content, run_id="run-1")
        self.assertEqual(store.count(), 0)

    def test_rejects_size_scope_and_path_like_name_before_retention(self):
        store = AttachmentStore(max_file_bytes=4)
        with self.assertRaisesRegex(AttachmentValidationError, "maximum size"):
            store.add("photo.png", "image/png", b"12345", run_id="run-1")
        with self.assertRaisesRegex(AttachmentValidationError, "invalid run scope"):
            AttachmentStore().add("photo.png", "image/png", b"x", run_id="../escape")
        record = AttachmentStore().add("../../report.pdf", "application/pdf", pdf_with_text(), run_id="run-1")
        self.assertEqual(record.name, "report.pdf")


class AttachmentHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = serve(port=0, api_key="test-secret")
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def request(self, path: str, *, key: str | None = "test-secret", body: bytes | None = None, content_type: str | None = None):
        headers = {}
        if key is not None:
            headers["Authorization"] = f"Bearer {key}"
        if content_type:
            headers["Content-Type"] = content_type
        request = Request(self.base_url + path, data=body, headers=headers, method="POST" if body is not None else "GET")
        try:
            with urlopen(request, timeout=2) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            return error.code, json.loads(error.read())

    def test_capabilities_require_authentication(self):
        status, body = self.request("/v1/capabilities", key=None)
        self.assertEqual(status, 401)
        self.assertEqual(body["error"]["code"], "unauthorized")
        status, body = self.request("/v1/capabilities")
        self.assertEqual(status, 200)
        self.assertEqual(body["adapter_version"], "1.0")

    def test_authenticated_pdf_intake_returns_metadata_not_content(self):
        body, content_type = multipart("run-http-1", "report.pdf", "application/pdf", pdf_with_text("private text"))
        status, response = self.request("/v1/attachments/documents", body=body, content_type=content_type)
        self.assertEqual(status, 201)
        self.assertTrue(response["attachment_id"].startswith("att_local_"))
        self.assertEqual(response["text_chars"], len("private text"))
        self.assertEqual(response["delivery"], "intake_only")
        self.assertNotIn("text", response)
        self.assertNotIn("private text", json.dumps(response))

    def test_intake_rejects_legacy_doc_bad_content_type_and_wrong_auth(self):
        body, content_type = multipart("run-http-2", "legacy.doc", "application/msword", b"legacy")
        status, response = self.request("/v1/attachments/documents", body=body, content_type=content_type)
        self.assertEqual(status, 400)
        self.assertIn("convert to DOCX", response["error"]["message"])
        status, _ = self.request("/v1/attachments/documents", key="wrong", body=body, content_type=content_type)
        self.assertEqual(status, 401)
        status, response = self.request("/v1/attachments/documents", body=b"{}", content_type="application/json")
        self.assertEqual(status, 400)
        self.assertIn("multipart/form-data", response["error"]["message"])


if __name__ == "__main__":
    unittest.main()
