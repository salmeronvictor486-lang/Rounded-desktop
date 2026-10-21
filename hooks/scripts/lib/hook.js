'use strict';
/**
 * Shared helpers for Rounded hook scripts.
 *
 * Hooks receive one JSON object on stdin (see https://docs.claude.com/en/docs/claude-code/hooks)
 * and answer through their exit code and stdout/stderr:
 *   - exit 0, no output      -> nothing happens
 *   - exit 0, JSON on stdout -> structured decision (allow / ask / deny, extra context)
 *   - exit 2, text on stderr -> blocking error; the text is shown to the model
 *
 * Every script must fail open: a bug in a hook should never break the user's session,
 * so unexpected errors are swallowed and the script exits 0.
 */

const PROFILES = ['minimal', 'standard', 'strict'];

/** Active profile from ROUNDED_HOOK_PROFILE (default "standard"; unknown values fall back to it). */
function profile(env = process.env) {
  const p = String(env.ROUNDED_HOOK_PROFILE || '').trim().toLowerCase();
  return PROFILES.includes(p) ? p : 'standard';
}

/**
 * Whether a hook should run. `minProfile` is the lowest profile that enables it
 * ("minimal" hooks run everywhere, "strict" hooks only in strict mode).
 * Any hook can be switched off by id with ROUNDED_DISABLED_HOOKS=id1,id2.
 */
function enabled(id, minProfile = 'minimal', env = process.env) {
  const disabled = String(env.ROUNDED_DISABLED_HOOKS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (disabled.includes(id) || disabled.includes('all')) return false;
  return PROFILES.indexOf(profile(env)) >= PROFILES.indexOf(minProfile);
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

async function readInput() {
  const raw = await readStdin();
  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** PreToolUse decision object for stdout. */
function preToolDecision(decision, reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  };
}

/**
 * Runs a hook. `fn(input)` returns one of:
 *   undefined                      -> no output, exit 0
 *   { json: object }               -> JSON printed to stdout, exit 0
 *   { stdout: string }             -> text printed to stdout, exit 0 (added as context on SessionStart)
 *   { block: string }              -> text on stderr, exit 2
 */
function run(id, minProfile, fn) {
  if (!enabled(id, minProfile)) return;
  readInput()
    .then((input) => fn(input))
    .then((res) => {
      if (!res) return;
      if (res.block) {
        process.stderr.write(`${res.block}\n`);
        process.exitCode = 2;
      } else if (res.json) {
        process.stdout.write(`${JSON.stringify(res.json)}\n`);
      } else if (res.stdout) {
        process.stdout.write(`${res.stdout}\n`);
      }
    })
    .catch((err) => {
      if (process.env.ROUNDED_HOOK_DEBUG) process.stderr.write(`[rounded:${id}] ${err && err.stack}\n`);
    });
}

module.exports = { PROFILES, profile, enabled, readInput, preToolDecision, run };
