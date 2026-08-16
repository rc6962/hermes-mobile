"""Full Hermes→Balls sweep over the app's own code (vendored python untouched).

Rules:
- hermes-api → balls-api (filename + imports + types)
- HermesApi/HermesApiError/HermesApiOptions/createHermesApi → BallsApi*
- FakeHermesServer → FakeBallsServer (file + symbols)
- HermesStream* → BallsStream* (plugin + native stream)
- HermesBridge* → BallsBridge* (plugin + bridge client)
- HermesAccessibility* → BallsAccessibility* (Java service + manifest)
- VITE_HERMES_API_URL → VITE_BALLS_API_URL (with legacy fallback kept in code)
- hermes-mobile.presentation-preferences.v1 → balls.presentation-preferences.v1 (load migrates)
- Every other "Hermes"/"hermes" in our files → "Balls"/"balls" (comments, strings, tests)
"""
import os
import re
from pathlib import Path

ROOT = Path(r'D:\Hermes\hermes-mobile\mobile')
SKIP_DIRS = {'node_modules', 'dist', '.android-build', 'python', 'build'}

# file renames: old -> new (relative to ROOT)
FILE_RENAMES = {
    'src/lib/hermes-api.ts': 'src/lib/balls-api.ts',
    'src/lib/__tests__/hermes-api.test.ts': 'src/lib/__tests__/balls-api.test.ts',
    'src/lib/__tests__/fake-hermes-server.test.ts': 'src/lib/__tests__/fake-balls-server.test.ts',
    'android/app/src/main/java/com/epictechs/balls/HermesStreamPlugin.java':
        'android/app/src/main/java/com/epictechs/balls/BallsStreamPlugin.java',
    'android/app/src/main/java/com/epictechs/balls/HermesBridgePlugin.java':
        'android/app/src/main/java/com/epictechs/balls/BallsBridgePlugin.java',
    'android/app/src/main/java/com/epictechs/balls/HermesAccessibilityService.java':
        'android/app/src/main/java/com/epictechs/balls/BallsAccessibilityService.java',
}

IDENTITY_MAP = [
    ('createFakeHermesServer', 'createFakeBallsServer'),
    ('FakeHermesServer', 'FakeBallsServer'),
    ('hermes-api', 'balls-api'),
    ('createHermesApi', 'createBallsApi'),
    ('HermesApiError', 'BallsApiError'),
    ('HermesApiOptions', 'BallsApiOptions'),
    ('HermesApi', 'BallsApi'),
    ('HermesStreamPlugin', 'BallsStreamPlugin'),
    ('HermesStream', 'BallsStream'),
    ('HermesBridgePlugin', 'BallsBridgePlugin'),
    ('HermesBridge', 'BallsBridge'),
    ('HermesAccessibilityService', 'BallsAccessibilityService'),
    ('HermesAccessibility', 'BallsAccessibility'),
    ('hermes-mobile.presentation-preferences.v1', 'balls.presentation-preferences.v1'),
    ('VITE_HERMES_API_URL', 'VITE_BALLS_API_URL'),
    ('"HermesStream"', '"BallsStream"'),
    ('"HermesBridge"', '"BallsBridge"'),
    ('Hermes', 'Balls'),
    ('hermes', 'balls'),
]

def iter_files():
    for root, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            p = Path(root) / f
            if p.suffix in {'.ts', '.tsx', '.java', '.xml', '.gradle', '.json', '.css', '.html', '.md'}:
                yield p

changed = []
for p in iter_files():
    if any(part in SKIP_DIRS for part in p.parts):
        continue
    rel = p.relative_to(ROOT)
    try:
        s = p.read_text(encoding='utf-8')
    except (UnicodeDecodeError, OSError):
        continue
    orig = s
    for old, new in IDENTITY_MAP:
        s = s.replace(old, new)
    if s != orig:
        p.write_bytes(s.replace('\r\n', '\n').encode('utf-8'))
        changed.append(str(rel))

for old, new in FILE_RENAMES.items():
    src = ROOT / old
    dst = ROOT / new
    if src.exists() and not dst.exists():
        src.rename(dst)
        changed.append(f'RENAMED {old} -> {new}')

print(f'{len(changed)} files changed')
for c in changed:
    print(' ', c)
