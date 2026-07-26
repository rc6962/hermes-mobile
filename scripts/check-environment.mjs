#!/usr/bin/env node

/**
 * check-environment.mjs
 *
 * Hermes Mobile — Build-tool environment diagnostic.
 * Cross-platform Node 18+ (Node standard library only).
 *
 * Checks:
 *   - Node.js and npm
 *   - Java (major version 21+; required by the Capacitor 8 Android toolchain)
 *   - Android SDK root environment variable
 *   - adb availability
 *   - Required Android SDK platform / build-tools (when discoverable)
 *   - Gradle wrapper availability
 *
 * Exit codes:
 *   0 — healthy or warning-only environment (usable for development)
 *   1 — unusable required runtime (missing Node, Java, or Android SDK root)
 *   2 — malformed invocation (unknown flags)
 *
 * Usage:
 *   node scripts/check-environment.mjs         # human-readable output
 *   node scripts/check-environment.mjs --json  # machine-readable JSON
 *   node scripts/check-environment.mjs --help  # usage
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { homedir, platform, release } from 'os';
import path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUIRED_JAVA_MAJOR = 21;
const PREFERRED_API_LEVELS = [36, 35, 34];

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const FLAG_JSON = '--json';
const FLAG_HELP = '--help';
const ALLOWED_FLAGS = new Set([FLAG_JSON, FLAG_HELP]);

const jsonMode = args.includes(FLAG_JSON);
const helpMode = args.includes(FLAG_HELP);
const unknownFlags = args.filter((a) => !ALLOWED_FLAGS.has(a));

if (helpMode && unknownFlags.length === 0) {
  printUsage();
  process.exit(0);
}

if (unknownFlags.length > 0) {
  process.stderr.write(
    `Unknown flag(s): ${unknownFlags.join(', ')}\n`,
  );
  printUsage();
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeExec(cmd, opts = {}) {
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...opts,
    });
    return { stdout: stdout.trim(), stderr: '', error: null };
  } catch (e) {
    return {
      stdout: (e.stdout || '').toString().trim(),
      stderr: (e.stderr || '').toString().trim(),
      error: e.message || String(e),
    };
  }
}

function parseJavaMajor(versionStr) {
  const m = versionStr.match(/"([^"]+)"/);
  if (!m) return null;
  const ver = m[1];
  // Old naming: "1.8.0_201" → 8
  if (ver.startsWith('1.')) {
    return parseInt(ver.split('.')[1], 10) || null;
  }
  // New naming: "17.0.2" → 17
  const major = parseInt(ver.split('.')[0], 10);
  return Number.isNaN(major) ? null : major;
}

function parseNodeMajor(versionStr) {
  const m = versionStr.match(/^v?(\d+)/);
  if (!m) return null;
  const major = parseInt(m[1], 10);
  return Number.isNaN(major) ? null : major;
}

/**
 * Normalize a path to use forward slashes and resolve to absolute.
 */
function normalizePath(p) {
  if (!p || typeof p !== 'string') return '';
  try {
    return path.resolve(p.replace(/\\/g, '/'));
  } catch {
    return p.replace(/\\/g, '/');
  }
}

/**
 * List subdirectory names inside a directory, or return [] if absent.
 */
function listSubdirs(dir) {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir).filter((e) => {
      try {
        return statSync(path.join(dir, e)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Check runner
// ---------------------------------------------------------------------------

const checks = [];
let failCount = 0;
let warnCount = 0;

function record(name, status, message, details = {}) {
  checks.push({ name, status, message, details });
  if (status === 'fail') failCount++;
  if (status === 'warn') warnCount++;
}

function runCheck(name, fn) {
  try {
    const result = fn();
    record(name, result.status, result.message, result.details || {});
  } catch (err) {
    record(name, 'fail', `Check threw: ${err.message}`, { error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkNode() {
  const nodeVer = process.version;
  const major = parseNodeMajor(nodeVer);
  const minMajor = 18;

  if (major === null) {
    return { status: 'fail', message: `Could not parse Node version: ${nodeVer}`, details: { version: nodeVer } };
  }
  if (major < minMajor) {
    return { status: 'fail', message: `Node.js ${nodeVer} — minimum major is ${minMajor}`, details: { version: nodeVer, major } };
  }

  const npm = safeExec('npm --version');
  if (npm.error) {
    return { status: 'warn', message: `Node.js ${nodeVer} (npm unavailable: ${npm.stderr || npm.error})`, details: { version: nodeVer, major, npm: null } };
  }

  return { status: 'pass', message: `Node.js ${nodeVer}  npm v${npm.stdout}`, details: { version: nodeVer, major, npm: npm.stdout } };
}

function checkJava() {
  const result = safeExec('java -version 2>&1');
  if (result.error) {
    return { status: 'fail', message: `Java not found (${result.stderr || result.error})`, details: { found: false } };
  }

  const output = result.stdout || result.stderr;
  const major = parseJavaMajor(output);
  if (major === null) {
    return { status: 'fail', message: `Could not parse Java version`, details: { found: true, raw: output.substring(0, 200) } };
  }
  if (major < REQUIRED_JAVA_MAJOR) {
    return { status: 'fail', message: `Java ${major} — major ${REQUIRED_JAVA_MAJOR}+ required`, details: { major, required: REQUIRED_JAVA_MAJOR } };
  }

  const firstLine = output.split('\n')[0].trim();
  return { status: 'pass', message: `Java  ${firstLine}`, details: { major, raw: firstLine } };
}

function checkAndroidSdkRoot() {
  let sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';

  if (!sdkRoot) {
    const osName = platform();
    const home = homedir();
    const candidates = [];

    if (osName === 'win32') {
      candidates.push(
        path.join(home, 'AppData', 'Local', 'Android', 'Sdk'),
        path.join(home, 'scoop', 'apps', 'android-clt', 'current'),
      );
    } else if (osName === 'darwin') {
      candidates.push(path.join(home, 'Library', 'Android', 'sdk'));
    }
    candidates.push(
      path.join(home, 'Android', 'Sdk'),
      '/usr/lib/android-sdk',
      '/opt/android-sdk',
    );

    for (const c of candidates) {
      if (existsSync(c)) {
        sdkRoot = c;
        break;
      }
    }
  }

  if (!sdkRoot) {
    return {
      status: 'fail',
      message: 'ANDROID_HOME / ANDROID_SDK_ROOT not set and no default SDK directory found',
      details: { home: null, env_android_home: process.env.ANDROID_HOME || null, env_android_sdk_root: process.env.ANDROID_SDK_ROOT || null },
    };
  }

  const normalized = normalizePath(sdkRoot);
  if (!existsSync(normalized)) {
    return {
      status: 'fail',
      message: `ANDROID_HOME set but directory does not exist: ${sdkRoot}`,
      details: { home: normalized, env_android_home: process.env.ANDROID_HOME || null, env_android_sdk_root: process.env.ANDROID_SDK_ROOT || null },
    };
  }

  return { status: 'pass', message: `Android SDK  ${normalized}`, details: { home: normalized } };
}

function checkAdb() {
  const result = safeExec('adb version');
  if (result.error) {
    return { status: 'warn', message: `adb not found on PATH (${result.stderr || result.error})`, details: { found: false } };
  }
  const firstLine = (result.stdout || result.stderr || '').split('\n')[0].trim();
  return { status: 'pass', message: `adb  ${firstLine}`, details: { found: true, raw: firstLine } };
}

function checkSdkPlatform(sdkHome) {
  if (!sdkHome || !existsSync(sdkHome)) {
    return { status: 'skip', message: 'SDK root not available — cannot check platforms', details: {} };
  }

  const dir = path.join(sdkHome, 'platforms');
  const dirs = listSubdirs(dir);

  if (dirs.length === 0) {
    return { status: 'warn', message: `No SDK platforms installed — run: sdkmanager "platforms;android-36"`, details: { directory: dir, installed: [] } };
  }

  const foundPreferred = PREFERRED_API_LEVELS.some((api) => dirs.includes(`android-${api}`));
  if (foundPreferred) {
    return { status: 'pass', message: `${dir}  [${dirs.join(', ')}]`, details: { directory: dir, installed: dirs } };
  }

  const sorted = [...dirs].sort().reverse();
  return {
    status: 'warn',
    message: `SDK platforms: ${sorted.join(', ')} — none in preferred set [${PREFERRED_API_LEVELS.map(a => `android-${a}`).join(', ')}] (highest: ${sorted[0]})`,
    details: { directory: dir, installed: dirs },
  };
}

function checkBuildTools(sdkHome) {
  if (!sdkHome || !existsSync(sdkHome)) {
    return { status: 'skip', message: 'SDK root not available — cannot check build-tools', details: {} };
  }

  const dir = path.join(sdkHome, 'build-tools');
  const dirs = listSubdirs(dir);

  if (dirs.length === 0) {
    return { status: 'warn', message: `No build-tools installed — run: sdkmanager "build-tools;36.0.0"`, details: { directory: dir, installed: [] } };
  }

  return { status: 'pass', message: `${dir}  [${dirs.join(', ')}]`, details: { directory: dir, installed: dirs } };
}

function checkAndroidDevice() {
  const result = safeExec('adb devices -l');
  if (result.error) {
    return { status: 'warn', message: 'adb not available — cannot check for devices', details: { adb_available: false } };
  }

  const output = result.stdout || result.stderr || '';
  const lines = output.split('\n').filter((l) => l.trim() && !l.includes('List of devices'));
  const connected = lines.filter((l) => l.includes('device') && !l.includes('offline')).length;

  if (connected === 0) {
    return { status: 'warn', message: 'No Android device or emulator attached', details: { connected: 0 } };
  }
  return { status: 'pass', message: `${connected} device(s) attached`, details: { connected } };
}

function checkGradleWrapper() {
  const cwd = process.cwd();
  const locations = [
    path.join(cwd, 'gradlew'),
    path.join(cwd, 'mobile', 'android', 'gradlew'),
    path.join(cwd, 'android', 'gradlew'),
  ];

  for (const loc of locations) {
    if (existsSync(loc)) {
      const propsPath = path.join(path.dirname(loc), 'gradle', 'wrapper', 'gradle-wrapper.properties');
      let version = '';
      if (existsSync(propsPath)) {
        try {
          const props = readFileSync(propsPath, 'utf-8');
          const vm = props.match(/distributionUrl.*gradle-(\d[\d.]*)-/);
          if (vm) version = vm[1];
        } catch {
          // ignore read errors
        }
      }
      const msg = version ? `Gradle wrapper  ${loc}  (v${version})` : `Gradle wrapper  ${loc}`;
      return { status: 'pass', message: msg, details: { path: loc, version: version || null, found: true } };
    }
  }

  // No wrapper — check system gradle
  const gr = safeExec('gradle --version');
  if (!gr.error) {
    const gl = gr.stdout || gr.stderr || '';
    const vm = gl.match(/Gradle (\d[\d.]*)/);
    const ver = vm ? vm[1] : 'unknown';
    return {
      status: 'warn',
      message: `No Gradle wrapper (gradlew) found; system gradle v${ver} on PATH`,
      details: { found: false, system_gradle: ver },
    };
  }

  return {
    status: 'warn',
    message: 'No Gradle wrapper (gradlew) or system gradle found — run: gradle wrapper (or cd android && gradle wrapper)',
    details: { found: false, system_gradle: null },
  };
}

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------

function determineResult() {
  if (failCount > 0) return 'fail';
  if (warnCount > 0) return 'warn';
  return 'pass';
}

function summaryText(result) {
  switch (result) {
    case 'pass': return 'All checks passed — environment is ready for development.';
    case 'warn': return 'Environment is usable for development, but address the warnings above for a smoother experience.';
    case 'fail': return 'Required runtime(s) are missing or misconfigured. Fix the failures above before proceeding.';
    default: return '';
  }
}

function exitCode(result) {
  return result === 'fail' ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------

function printUsage() {
  const name = path.basename(process.argv[1]);
  process.stderr.write(`
Hermes Mobile — Environment Diagnostic

Usage:
  node ${name}            human-readable output
  node ${name} --json     machine-readable JSON
  node ${name} --help     this message

Exit codes:
  0   healthy or warning-only (usable for development)
  1   required runtime is missing or unusable
  2   unknown flag(s)

`);
}

function printHuman() {
  const symbols = { pass: '\u2714', warn: '\u26a0', fail: '\u2718', skip: '\u2014' };
  const colors = { pass: '\x1b[32m', warn: '\x1b[33m', fail: '\x1b[31m', skip: '\x1b[2m' };
  const reset = '\x1b[0m';
  const dim = '\x1b[2m';

  console.log('');
  console.log('\x1b[1mHermes Mobile \u2014 Environment Check\x1b[0m');
  console.log(dim + '='.repeat(48) + reset);
  console.log('');

  for (const chk of checks) {
    const sym = symbols[chk.status] || '\u2014';
    const col = colors[chk.status] || '';
    console.log(`  ${col}${sym}${reset}  ${chk.message}`);
  }

  const result = determineResult();
  const col = colors[result] || '\x1b[0m';
  console.log('');
  console.log(`  ${col}\u25cf${reset}  ${summaryText(result)}`);
  console.log('');
}

function printJson() {
  const result = determineResult();
  const root = {
    result,
    summary: summaryText(result),
    host: { platform: platform(), release: release() },
    checks: checks.map((c) => {
      const obj = { name: c.name, status: c.status, message: c.message };
      if (c.details && Object.keys(c.details).length > 0) {
        obj.details = c.details;
      }
      return obj;
    }),
  };
  console.log(JSON.stringify(root, null, 2));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  runCheck('node', checkNode);
  runCheck('java', checkJava);
  runCheck('android_sdk_root', checkAndroidSdkRoot);

  // adb — warning only if missing
  runCheck('adb', checkAdb);

  // SDK packages — only probe if SDK root was discovered
  const sdkCheck = checks.find((c) => c.name === 'android_sdk_root');
  const sdkHome =
    sdkCheck && sdkCheck.status !== 'fail'
      ? (sdkCheck.details && sdkCheck.details.home) || null
      : null;

  runCheck('android_platform', () => checkSdkPlatform(sdkHome));
  runCheck('android_build_tools', () => checkBuildTools(sdkHome));

  // Device check
  runCheck('android_device', checkAndroidDevice);

  // Gradle wrapper
  runCheck('gradle', checkGradleWrapper);

  // Output
  if (jsonMode) {
    printJson();
  } else {
    printHuman();
  }

  process.exit(exitCode(determineResult()));
}

main();
