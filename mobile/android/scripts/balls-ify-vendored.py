"""Re-apply Balls branding to user-facing strings inside the VENDORED
Hermes engine. Run after every vendor refresh (weekly Hermes update pass):
    python scripts/balls-ify-vendored.py

Only touches strings that surface on the phone screen (API error headers,
run-failed messages). Internal logs and identifiers stay upstream-clean so
the update channel diff stays small.
"""
from pathlib import Path

PY_ROOT = Path(__file__).resolve().parent.parent / "app" / "src" / "main" / "python"

PATCHES = [
    # api_server: the error response header the app surfaces.
    ("gateway/platforms/api_server.py", "X-Hermes-Error", "X-Balls-Error"),
    # run.py: gateway update failure messages shown in chat.
    ("gateway/run.py", "❌ Hermes update failed", "❌ Balls update failed"),
    # auth.py: provider-login error text that reaches run errors.
    ("hermes_cli/auth.py", "Hermes is not logged into Nous Portal.", "Balls is not logged into Nous Portal."),
    # weixin.py: user-facing adapter message.
    ("gateway/platforms/weixin.py", "not in Hermes.", "not in Balls."),
]


def main() -> None:
    applied = 0
    for rel, old, new in PATCHES:
        path = PY_ROOT / rel
        text = path.read_text(encoding="utf-8")
        count = text.count(old)
        if count:
            # Windows: write_text translates \n to \r\n — keep LF so the
            # vendored tree stays upstream-clean (git diff --check).
            with path.open("w", encoding="utf-8", newline="\n") as f:
                f.write(text.replace(old, new))
            applied += count
            print(f"{rel}: {count} replacement(s)")
        else:
            print(f"{rel}: no match (already applied?)")
    print(f"done — {applied} string(s) patched")


if __name__ == "__main__":
    main()
