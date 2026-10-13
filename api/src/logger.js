const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const secretKey = /token|secret|password|authorization|cookie|api.?key|database.?url|payment.?proof/i;
function redact(value, depth = 0) {
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map(v => redact(v, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, val]) => [
    key, secretKey.test(key) ? '[REDACTED]' : redact(val, depth + 1)
  ]));
}
export function createLogger(level = 'info') {
  return Object.freeze(Object.fromEntries(Object.entries(levels).map(([name, priority]) => [
    name, (event, fields = {}) => {
      if (priority > (levels[level] ?? levels.info)) return;
      const line = { time: new Date().toISOString(), level: name, event, ...redact(fields) };
      process.stdout.write(JSON.stringify(line) + '\n');
    }
  ])));
}