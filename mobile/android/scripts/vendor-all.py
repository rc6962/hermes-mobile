"""Vendor the complete Hermes dependency closure into src/main/python/.

Every package is fetched from its PyPI sdist (no wheels), extracted, and
copied under its import name. After this runs, Chaquopy's pip resolver is
not involved at all — src/main/python IS the environment.

Entries: (pypi_name, pinned_version_or_None, sdist_subpath, import_name)
"""
import json
import os
import shutil
import tarfile
import urllib.request

DEST = r"D:\Hermes\hermes-mobile\mobile\android\app\src\main\python"

# (pypi_name, version, subpath_inside_sdist, import_name)
ENTRIES = [
    ("uvicorn", "0.41.0", "uvicorn", "uvicorn"),
    ("python-multipart", "0.0.27", "python_multipart", "python_multipart"),
    ("anyio", None, "anyio", "anyio"),
    ("idna", None, "idna", "idna"),
    ("sniffio", None, "sniffio", "sniffio"),
    ("typing-extensions", None, "typing_extensions", "typing_extensions"),
    ("annotated-types", None, "annotated_types", "annotated_types"),
    ("typing-inspection", None, "typing_inspection", "typing_inspection"),
    ("h11", None, "h11", "h11"),
    ("click", None, "click", "click"),
    ("certifi", "2026.5.20", "certifi", "certifi"),
    ("python-dotenv", "1.2.2", "dotenv", "dotenv"),
    ("fire", "0.7.1", "fire", "fire"),
    ("httpx", "0.28.1", "httpx", "httpx"),
    ("socksio", None, "socksio", "socksio"),
    ("httpcore", None, "httpcore", "httpcore"),
    ("rich", "14.3.3", "rich", "rich"),
    ("markdown-it-py", None, "markdown_it_py", "markdown_it_py"),
    ("mdurl", None, "mdurl", "mdurl"),
    ("pygments", None, "pygments", "pygments"),
    ("tenacity", "9.1.4", "tenacity", "tenacity"),
    ("requests", "2.33.0", "requests", "requests"),
    ("charset-normalizer", None, "charset_normalizer", "charset_normalizer"),
    ("prompt-toolkit", "3.0.52", "prompt_toolkit", "prompt_toolkit"),
    ("wcwidth", None, "wcwidth", "wcwidth"),
    ("croniter", "6.0.0", "croniter", "croniter"),
    ("python-dateutil", None, "dateutil", "dateutil"),
    ("six", None, "six.py", "six.py"),
    ("packaging", "26.0", "packaging", "packaging"),
    ("Markdown", "3.10.2", "markdown", "markdown"),
    ("PyJWT", "2.13.0", "jwt", "jwt"),
    ("urllib3", "2.7.0", "urllib3", "urllib3"),
    ("websockets", "15.0.1", "websockets", "websockets"),
    ("pathspec", "1.1.1", "pathspec", "pathspec"),
    ("ptyprocess", "0.7.0", "ptyprocess", "ptyprocess"),
    # aiohttp family — Hermes API server platform (hermes messaging extra
    # pins aiohttp==3.14.1 for CVE-2026-34513/34993 fixes). Pure-Python
    # fallbacks run fine for the loopback API server.
    ("aiohttp", "3.14.1", "aiohttp", "aiohttp"),
    ("yarl", None, "yarl", "yarl"),
    ("multidict", None, "multidict", "multidict"),
    ("frozenlist", None, "frozenlist", "frozenlist"),
    ("aiosignal", None, "aiosignal", "aiosignal"),
    ("attrs", None, "attr", "attr"),
]

WORK = os.path.join(os.environ.get("TEMP", "/tmp"), "vendor-all")
os.makedirs(WORK, exist_ok=True)


def fetch_sdist(name, version):
    url = f"https://pypi.org/pypi/{name}/{version}/json" if version else f"https://pypi.org/pypi/{name}/json"
    data = json.load(urllib.request.urlopen(url, timeout=60))
    resolved = data["info"]["version"]
    files = [u for u in data["urls"] if u["packagetype"] == "sdist"]
    if not files:
        raise RuntimeError(f"no sdist for {name}=={resolved}")
    sdist = files[0]
    fn = os.path.join(WORK, sdist["filename"])
    if not os.path.exists(fn):
        urllib.request.urlretrieve(sdist["url"], fn)
    return fn, resolved


def main():
    done, failed = [], []
    for name, version, subpath, import_name in ENTRIES:
        try:
            fn, version = fetch_sdist(name, version)
            extract_dir = os.path.join(WORK, f"{name}-{version}")
            os.makedirs(extract_dir, exist_ok=True)
            with tarfile.open(fn) as t:
                t.extractall(extract_dir)
            # Top-level dir inside the sdist: exactly one real directory.
            top = None
            for cand in os.listdir(extract_dir):
                if os.path.isdir(os.path.join(extract_dir, cand)):
                    top = cand
                    break
            if top is None:
                raise RuntimeError(f"no top dir in {name} sdist")
            # Resolve package location: classic root layout or src/ layout.
            cands = [os.path.join(extract_dir, top, subpath),
                     os.path.join(extract_dir, top, "src", subpath)]
            src = next((c for c in cands if os.path.exists(c)), None)
            if src is None:
                raise RuntimeError(f"{name}: neither {cands[0]} nor {cands[1]} exists")
            dst = os.path.join(DEST, import_name)
            if os.path.isfile(src):
                shutil.copy2(src, dst)
            else:
                shutil.copytree(src, dst, dirs_exist_ok=True)
            done.append(f"{name}=={version}")
        except Exception as e:  # noqa: BLE001
            failed.append(f"{name}: {e}")
    print(f"VENDORED {len(done)}/{len(ENTRIES)}")
    for d in done:
        print("  ok", d)
    for f in failed:
        print("  FAIL", f)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
