# Balls Android wheel build pipeline
#
# Builds Rust/C-extension wheels for Chaquopy 17 (CPython 3.11, arm64-v8a)
# that are NOT available in Chaquopy's wheel index. Produced wheels are
# unpacked into mobile/android/app/src/main/python/<package>/ (vendored)
# and recorded here.

set -eu

export ANDROID_NDK_ROOT="${ANDROID_NDK_ROOT:-C:/Users/RickCain/AppData/Local/Android/Sdk/ndk/27.2.12479018}"
export PATH="$PATH:/c/Users/RickCain/.cargo/bin"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/windows-x86_64/bin/aarch64-linux-android21-clang.cmd"

# Empty libpython stub: abi3 extension modules must not link libpython;
# pyo3 emits -lpython3 anyway, so satisfy the linker with an empty archive.
STUB_DIR="$(mktemp -d)"
"$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-ar.exe" rcs "$STUB_DIR/libpython3.a"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS="-L $STUB_DIR"

PY311="C:/Users/RickCain/AppData/Local/Programs/Python/Python311/python.exe"

# Usage: build_rust_wheel <sdist_dir> [extra_maturin_args...]
build_rust_wheel() {
    local sdist="$1"; shift
    (cd "$sdist" && maturin build --release --target aarch64-linux-android \
        --interpreter "$PY311" "$@")
}

case "${1:-}" in
    jiter)
        # Requires: sdist extracted with Cargo.toml patched to
        # pyo3 features ["abi3-py311", "extension-module"].
        build_rust_wheel "${2:?usage: build-wheels.sh jiter <sdist_dir>}"
        ;;
    pydantic-core)
        build_rust_wheel "${2:?usage: build-wheels.sh pydantic-core <sdist_dir>}"
        ;;
    *)
        echo "usage: build-wheels.sh <jiter|pydantic-core> <sdist_dir>" >&2
        exit 2
        ;;
esac
