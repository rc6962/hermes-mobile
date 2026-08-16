"""Command-line entry point for the local attachment adapter.

Usage:
    python -m attachment_adapter [--host 127.0.0.1] [--port 8643]

The API key is read from the ATTACHMENT_ADAPTER_KEY environment variable;
the server refuses to start without one (fail closed — no unauthenticated
listener is ever created).
"""
from __future__ import annotations

import argparse
import os
import sys

from .server import serve


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Local Balls attachment adapter")
    parser.add_argument("--host", default="127.0.0.1", help="bind host (loopback only)")
    parser.add_argument("--port", type=int, default=8643, help="bind port")
    args = parser.parse_args(argv)

    api_key = os.environ.get("ATTACHMENT_ADAPTER_KEY", "")
    if not api_key:
        print("ATTACHMENT_ADAPTER_KEY is required; refusing to start unauthenticated.", file=sys.stderr)
        return 1

    if args.host not in ("127.0.0.1", "localhost"):
        print("Refusing to bind non-loopback host.", file=sys.stderr)
        return 1

    server = serve(host=args.host, port=args.port, api_key=api_key)
    print(f"Attachment adapter listening on {args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
