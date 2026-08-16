"""Vendor the llama.cpp Android arm64 runtime into src/main/python/llama/.

llama-server is a 7 KB ELF stub that dlopens libllama-server-impl.so at
runtime; the whole closure (stub + shared libs, including the 8
libggml-cpu-android_armv*_N.so CPU-backend variants that ggml dlopens
based on the device's ARM ISA) must live in one directory and be
reachable via LD_LIBRARY_PATH (the official Android binaries carry no
DT_RUNPATH). The GGUF is NOT vendored — it is downloaded on-device at
onboarding (3 GB; never commit it).

Strip step: the official android artifacts ship with debug_info
(~257 MB subset). NDK llvm-strip --strip-all cuts the subset to ~30 MB.

Source: https://github.com/ggml-org/llama.cpp/releases (llama-<tag>-bin-android-arm64.tar.gz)
"""
import hashlib
import os
import shutil
import subprocess
import tarfile
import urllib.request

DEST = r"D:\Hermes\hermes-mobile\mobile\android\app\src\main\python"
LLAMA_DEST = os.path.join(DEST, "llama")

# Pin: llama.cpp b10451 (2026-08-16). Verify against the GitHub release page.
LLAMA_RELEASE = "b10451"
ASSET_URL = (
    f"https://github.com/ggml-org/llama.cpp/releases/download/"
    f"{LLAMA_RELEASE}/llama-{LLAMA_RELEASE}-bin-android-arm64.tar.gz"
)
ASSET_SHA256 = "2b08c2a0104cbe7607948c698e1464b9a90aa915e078d7944ae921b946482a9d"

# Member names inside the tarball (top dir is llama-<tag>/).
MEMBERS = [
    "llama-server",
    "LICENSE",
    "libllama.so",
    "libllama-common.so",
    "libllama-server-impl.so",
    "libggml.so",
    "libggml-base.so",
    "libggml-rpc.so",
    "libmtmd.so",
    "libggml-cpu-android_armv8.0_1.so",
    "libggml-cpu-android_armv8.2_1.so",
    "libggml-cpu-android_armv8.2_2.so",
    "libggml-cpu-android_armv8.6_1.so",
    "libggml-cpu-android_armv9.0_1.so",
    "libggml-cpu-android_armv9.2_1.so",
    "libggml-cpu-android_armv9.2_2.so",
]

NDK_STRIP = (
    r"C:\Users\RickCain\AppData\Local\Android\Sdk\ndk\27.2.12479018"
    r"\toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-strip.exe"
)

WORK = os.path.join(os.environ.get("TEMP", "/tmp"), "vendor-llama")
os.makedirs(WORK, exist_ok=True)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch_asset():
    fn = os.path.join(WORK, f"llama-{LLAMA_RELEASE}-bin-android-arm64.tar.gz")
    if not os.path.exists(fn):
        print(f"downloading {ASSET_URL}")
        urllib.request.urlretrieve(ASSET_URL, fn)
    digest = sha256(fn)
    if ASSET_SHA256 != "?" and digest != ASSET_SHA256:
        raise RuntimeError(f"sha256 mismatch: {digest}")
    return fn, digest


def main():
    fn, digest = fetch_asset()
    if os.path.exists(LLAMA_DEST):
        shutil.rmtree(LLAMA_DEST)
    os.makedirs(LLAMA_DEST)
    total = 0
    with tarfile.open(fn) as t:
        for member in MEMBERS:
            name = member.split("/")[-1]
            src = t.extractfile(f"llama-{LLAMA_RELEASE}/{member}")
            if src is None:
                raise RuntimeError(f"missing member: {member}")
            dst = os.path.join(LLAMA_DEST, name)
            with open(dst, "wb") as out:
                shutil.copyfileobj(src, out)
            # Strip debug info + symtab from the ELF files.
            if name.endswith(".so") or name == "llama-server":
                subprocess.run([NDK_STRIP, "--strip-all", dst], check=True)
            size = os.path.getsize(dst)
            total += size
            print(f"  ok {name:42s} {size/1e6:7.1f} MB")
    with open(os.path.join(LLAMA_DEST, "VERSION"), "w", encoding="utf-8") as f:
        f.write(f"llama.cpp {LLAMA_RELEASE}\nsha256 {digest}\n")
    print(f"VENDORED llama.cpp {LLAMA_RELEASE} -> {LLAMA_DEST} ({total/1e6:.1f} MB unpacked, stripped)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
