'use strict';
/** Patterns for credentials that should never be written into source files. */
const PATTERNS = [
  { id: 'private-key', name: 'private key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'aws-access-key', name: 'AWS access key ID', re: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)[0-9A-Z]{16}\b/ },
  { id: 'aws-secret', name: 'AWS secret access key', re: /aws_?secret_?access_?key\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}\b/i },
  { id: 'github-token', name: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/ },
  { id: 'gitlab-token', name: 'GitLab token', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { id: 'slack-token', name: 'Slack token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'slack-webhook', name: 'Slack webhook URL', re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{20,}/ },
  { id: 'stripe-key', name: 'Stripe live key', re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/ },
  { id: 'google-api-key', name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'anthropic-key', name: 'Anthropic API key', re: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{80,}\b/ },
  { id: 'openai-key', name: 'OpenAI API key', re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}\b/ },
  { id: 'npm-token', name: 'npm token', re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { id: 'twilio-key', name: 'Twilio API key', re: /\bSK[0-9a-fA-F]{32}\b/ },
  { id: 'sendgrid-key', name: 'SendGrid API key', re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/ },
  { id: 'jwt', name: 'JSON Web Token', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { id: 'db-url-password', name: 'database URL with password', re: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|amqps?):\/\/[^\s:/@"'`]+:[^\s@"'`]{3,}@[^\s"'`]+/i },
];

/** Values that are obviously placeholders, so examples and docs do not trigger the scanner. */
const PLACEHOLDER = /(x{6,}|\*{4,}|<[^>]+>|\$\{[^}]+\}|example|placeholder|your[-_]?(api[-_]?)?(key|token|secret|password)|changeme|dummy|redacted|\.\.\.)/i;

/** Return the secrets found in `text` as [{ id, name, line }]. */
function scan(text) {
  if (typeof text !== 'string' || !text) return [];
  const found = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const p of PATTERNS) {
      const m = p.re.exec(line);
      if (!m) continue;
      if (p.id !== 'private-key' && PLACEHOLDER.test(m[0])) continue;
      found.push({ id: p.id, name: p.name, line: i + 1 });
    }
  });
  return found;
}

/** Text a Write / Edit / MultiEdit / NotebookEdit call would put on disk. */
function writtenText(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return '';
  const parts = [];
  if (typeof toolInput.content === 'string') parts.push(toolInput.content);
  if (typeof toolInput.new_string === 'string') parts.push(toolInput.new_string);
  if (typeof toolInput.new_source === 'string') parts.push(toolInput.new_source);
  if (Array.isArray(toolInput.edits)) for (const e of toolInput.edits) if (e && typeof e.new_string === 'string') parts.push(e.new_string);
  return parts.join('\n');
}

module.exports = { PATTERNS, scan, writtenText };
