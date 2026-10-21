'use strict';
/**
 * Rules for shell commands proposed by the agent.
 *
 * This is a safety net, not a sandbox: it catches the common, catastrophic
 * mistakes (wiping a disk, force-pushing over main, piping the internet into a
 * shell) with a low false-positive rate. Anything clever enough can get past a
 * pattern matcher, so keep real isolation (containers, least privilege) as well.
 */

/** Split a command line into simple commands on ; && || | and newlines, ignoring separators inside quotes. */
function splitCommands(cmd) {
  const parts = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (c === '\\' && quote === '"' && i + 1 < cmd.length) {
        cur += c + cmd[++i];
        continue;
      }
      if (c === quote) quote = null;
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
      continue;
    }
    if (c === '\\' && i + 1 < cmd.length) {
      cur += c + cmd[++i];
      continue;
    }
    // Redirections such as 2>&1, >&2 and &> are not command separators
    if (c === '&' && (cmd[i - 1] === '>' || cmd[i + 1] === '>')) {
      cur += c;
      continue;
    }
    if (c === ';' || c === '\n' || c === '|' || c === '&') {
      // `&&`, `||` and `|` all end the current command; a lone `&` backgrounds it
      if ((c === '&' || c === '|') && cmd[i + 1] === c) i++;
      if (cur.trim()) parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** Shell-like word splitting with quote removal (no expansion). */
function words(cmd) {
  const out = [];
  let cur = '';
  let quote = null;
  let has = false;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      has = true;
      continue;
    }
    if (c === '\\' && i + 1 < cmd.length) {
      cur += cmd[++i];
      has = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
      continue;
    }
    cur += c;
    has = true;
  }
  if (has || cur) out.push(cur);
  return out;
}

/** Drop leading wrappers (sudo, env VAR=1, time, nohup, command, exec) to find the real program. */
function unwrap(argv) {
  let a = [...argv];
  for (;;) {
    if (!a.length) return a;
    const [h] = a;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(h)) a = a.slice(1);
    else if (['sudo', 'doas', 'time', 'nohup', 'command', 'exec', 'nice'].includes(h)) {
      a = a.slice(1);
      while (a.length && a[0].startsWith('-')) a = a.slice(1);
    } else if (h === 'env') {
      a = a.slice(1);
      while (a.length && (a[0].startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(a[0]))) a = a.slice(1);
    } else return a;
  }
}

const SYSTEM_PATHS = new Set([
  '/', '/*', '~', '~/', '~/*', '$HOME', '$HOME/', '${HOME}', '/root', '/home', '/etc', '/usr', '/var', '/bin', '/sbin',
  '/lib', '/opt', '/boot', '/dev', '/sys', '/proc', '/System', '/Users', '/Library', 'C:\\', 'C:/', 'C:\\Windows',
]);

const PROTECTED_BRANCHES = /^(main|master|trunk|production|prod|release(\/.*)?)$/;

function rmRule(argv) {
  if (argv[0] !== 'rm') return null;
  let recursive = false;
  let force = false;
  const targets = [];
  let endOfFlags = false;
  for (const w of argv.slice(1)) {
    if (!endOfFlags && w === '--') endOfFlags = true;
    else if (!endOfFlags && w.startsWith('--')) {
      if (w === '--recursive') recursive = true;
      if (w === '--force') force = true;
      if (w === '--no-preserve-root') return { level: 'deny', reason: 'rm --no-preserve-root disables the last safeguard against deleting the whole filesystem.' };
    } else if (!endOfFlags && w.startsWith('-') && w.length > 1) {
      if (/r/i.test(w)) recursive = true;
      if (w.includes('f')) force = true;
    } else targets.push(w);
  }
  if (!recursive) return null;
  const bad = targets.find((t) => SYSTEM_PATHS.has(t.replace(/\/+$/, '') || '/') || SYSTEM_PATHS.has(t));
  if (bad) return { level: 'deny', reason: `Refusing \`rm -r\` on "${bad}": it would delete a system or home directory.` };
  const broad = targets.find((t) => ['.', '..', '*', './*', '../'].includes(t) || /^\.\.(\/\.\.)*\/?$/.test(t));
  if (broad && force) return { level: 'ask', reason: `\`rm -rf ${broad}\` deletes everything in the current or parent directory. Confirm this is intended.` };
  return null;
}

function gitRule(argv, currentBranch) {
  if (argv[0] !== 'git') return null;
  // Skip global options like -C dir, -c key=value
  let i = 1;
  while (i < argv.length && argv[i].startsWith('-')) i += argv[i] === '-C' || argv[i] === '-c' ? 2 : 1;
  const sub = argv[i];
  const rest = argv.slice(i + 1);
  if (sub === 'push') {
    const forceLease = rest.some((w) => w.startsWith('--force-with-lease') || w.startsWith('--force-if-includes'));
    const force = rest.some((w) => w === '--force' || w === '-f' || (/^-[a-zA-Z]+$/.test(w) && w.includes('f'))) || rest.some((w) => /^\+/.test(w));
    const positional = rest.filter((w) => !w.startsWith('-'));
    const refs = positional
      .slice(1)
      .map((r) => r.replace(/^\+/, '').split(':').pop())
      .map((r) => (r === 'HEAD' && currentBranch ? currentBranch : r));
    // Without an explicit refspec git pushes the current branch
    if (!refs.length && currentBranch) refs.push(currentBranch);
    const protectedRef = refs.find((r) => PROTECTED_BRANCHES.test(r.replace(/^refs\/heads\//, '')));
    if (rest.includes('--no-verify')) return { level: 'ask', reason: '`git push --no-verify` skips the repository pre-push checks.' };
    if (force && protectedRef) return { level: 'deny', reason: `Force-pushing to "${protectedRef}" rewrites shared history. Push to a feature branch and open a pull request instead.` };
    if (forceLease && protectedRef) return { level: 'ask', reason: `Force-pushing (with lease) to "${protectedRef}" rewrites shared history. Confirm this is intended.` };
    if (force || forceLease) return { level: 'ask', reason: 'Force push rewrites the remote branch history. Confirm this is intended.' };
    if (rest.includes('--mirror') || rest.includes('--delete') || positional.some((p) => p.startsWith(':'))) {
      return { level: 'ask', reason: 'This push deletes or mirrors remote refs. Confirm this is intended.' };
    }
    return null;
  }
  if (sub === 'commit' && (rest.includes('--no-verify') || rest.some((w) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(w) && !w.startsWith('--')))) {
    return { level: 'ask', reason: '`git commit --no-verify` skips the repository pre-commit checks. Fix the failing check instead, or confirm.' };
  }
  if (sub === 'reset' && rest.includes('--hard')) return { level: 'ask', reason: '`git reset --hard` discards uncommitted changes permanently.' };
  if (sub === 'clean' && rest.some((w) => /^-[a-zA-Z]*f/.test(w) || w === '--force')) return { level: 'ask', reason: '`git clean -f` permanently deletes untracked files.' };
  if ((sub === 'checkout' || sub === 'restore') && rest.includes('.') && !rest.includes('--staged')) {
    return { level: 'ask', reason: `\`git ${sub} .\` discards every unstaged change in the working tree.` };
  }
  if (sub === 'branch' && rest.includes('-D')) return { level: 'ask', reason: '`git branch -D` deletes a branch even if it is not merged.' };
  if (sub === 'filter-branch' || (sub === 'filter-repo')) return { level: 'ask', reason: 'History rewriting affects every clone of the repository.' };
  return null;
}

const PUBLISH = [
  [/^npm$|^pnpm$|^yarn$|^bun$/, (a) => a[1] === 'publish' || (a[1] === 'npm' && a[2] === 'publish'), 'Publishing a package is public and cannot be fully undone.'],
  [/^cargo$/, (a) => a[1] === 'publish', 'Publishing a crate is permanent: versions can be yanked but not deleted.'],
  [/^twine$/, (a) => a[1] === 'upload', 'Uploading to PyPI is public and permanent.'],
  [/^gem$/, (a) => a[1] === 'push', 'Pushing a gem is public.'],
  [/^terraform$|^tofu$/, (a) => a[1] === 'destroy' || (a[1] === 'apply' && a.includes('-auto-approve')), 'This changes real infrastructure without a review step.'],
  [/^kubectl$/, (a) => a[1] === 'delete', '`kubectl delete` removes live cluster resources.'],
  [/^docker$/, (a) => a[1] === 'system' && a[2] === 'prune' && a.some((w) => w === '-a' || w === '--all' || w === '--volumes'), 'This prune deletes all unused images and possibly volumes.'],
];

function otherRules(argv, raw) {
  const prog = argv[0] || '';
  if (/^mkfs(\.|$)/.test(prog) || prog === 'wipefs' || (prog === 'diskutil' && /erase/i.test(argv[1] || ''))) {
    return { level: 'deny', reason: `\`${prog}\` formats or wipes a disk.` };
  }
  if (prog === 'dd' && argv.some((w) => /^of=\/dev\/(sd|hd|nvme|disk|mmcblk|xvd|vd)/.test(w))) {
    return { level: 'deny', reason: '`dd` onto a raw disk device destroys its contents.' };
  }
  if ((prog === 'chmod' || prog === 'chown') && argv.some((w) => /^-[a-zA-Z]*R/.test(w)) && argv.some((w) => SYSTEM_PATHS.has(w))) {
    return { level: 'deny', reason: `Recursive \`${prog}\` on a system directory can make the machine unusable.` };
  }
  if (/>\s*\/dev\/(sd|hd|nvme|disk)[a-z0-9]*/.test(raw)) return { level: 'deny', reason: 'Writing directly to a disk device destroys its contents.' };
  for (const [re, test, reason] of PUBLISH) if (re.test(prog) && test(argv)) return { level: 'ask', reason };
  if (/\b(drop\s+(database|schema|table)|truncate\s+table)\b/i.test(raw) && /\b(psql|mysql|sqlite3|mongosh|cockroach|clickhouse|duckdb)\b/.test(raw)) {
    return { level: 'ask', reason: 'This SQL drops or truncates data.' };
  }
  return null;
}

/** Whole-line checks that need the original text (pipes, fork bombs). */
function lineRules(cmd) {
  if (/:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(cmd)) return { level: 'deny', reason: 'This is a fork bomb.' };
  if (/\b(curl|wget|iwr|Invoke-WebRequest)\b[^|]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/i.test(cmd) || /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(python3?|node|perl|ruby)\b/.test(cmd)) {
    return { level: 'ask', reason: 'Piping a downloaded script straight into an interpreter runs unreviewed code. Download it, read it, then run it.' };
  }
  return null;
}

const ORDER = { deny: 2, ask: 1 };

/** Evaluate a full command line. Returns the most severe finding or null. */
function evaluate(cmd, { strict = false, currentBranch = null } = {}) {
  if (typeof cmd !== 'string' || !cmd.trim()) return null;
  let worst = lineRules(cmd);
  const consider = (f) => {
    if (f && (!worst || ORDER[f.level] > ORDER[worst.level])) worst = f;
  };
  for (const part of splitCommands(cmd)) {
    const argv = unwrap(words(part));
    // Nested shells: bash -c "..." / sh -c '...'
    if (/^(ba|z|da|k)?sh$/.test(argv[0] || '') && argv[1] === '-c' && argv[2]) {
      consider(evaluate(argv[2], { strict, currentBranch }));
      continue;
    }
    consider(rmRule(argv));
    consider(gitRule(argv, currentBranch));
    consider(otherRules(argv, part));
    if (strict && /^(sudo|doas)$/.test(words(part)[0] || '')) consider({ level: 'ask', reason: 'Strict profile: commands with elevated privileges need confirmation.' });
  }
  return worst;
}

module.exports = { splitCommands, words, unwrap, evaluate };
