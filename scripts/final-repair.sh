#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="/var/www/helzerx-cloud"
API="$ROOT/api"
ENV_FILE="$API/.env"
BOT_ENV="/etc/helzerx-cloud-bot.env"
LOG_PREFIX="[helzerx-final-repair]"

log(){ printf '%s %s\n' "$LOG_PREFIX" "$*"; }
die(){ log "ERROR: $*"; exit 1; }
[[ $EUID -eq 0 ]] || die "Run as root: bash scripts/final-repair.sh"
[[ -d "$ROOT/.git" ]] || die "Repository not found at $ROOT"
[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE. Existing API config was not changed."
command -v node >/dev/null || die "Node.js is required."
command -v python3 >/dev/null || die "python3 is required."
command -v openssl >/dev/null || die "openssl is required."

cd "$ROOT"
log "Pulling the latest committed GitHub main branch."
git pull --ff-only origin main

# Never silently replace a remote database target.
DB_TARGET="$(node --input-type=module -e "import fs from 'node:fs';const t=fs.readFileSync(process.argv[1],'utf8');const m=t.match(/^\\s*DATABASE_URL\\s*=\\s*(.*)\\s*$/m);if(!m)process.exit(2);try{console.log(new URL(m[1].replace(/^['\"]|['\"]$/g,'')).hostname)}catch{process.exit(3)}" "$ENV_FILE")" || die "DATABASE_URL is missing or invalid."
case "$DB_TARGET" in
  127.0.0.1|localhost) ;;
  *) die "DATABASE_URL points to '$DB_TARGET', not local PostgreSQL. No database or config was changed; configure the intended remote database first." ;;
esac

log "Ensuring PostgreSQL is installed and running (existing database files are preserved)."
if ! dpkg-query -W -f='${Status}' postgresql 2>/dev/null | grep -q 'install ok installed'; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y postgresql postgresql-contrib
fi
systemctl enable --now postgresql

DB_PASSWORD="$(openssl rand -hex 32)"
if runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='helzerx_api'" | grep -q '^1$'; then
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -v db_password="$DB_PASSWORD" <<'SQL'
ALTER ROLE helzerx_api WITH LOGIN PASSWORD :'db_password';
SQL
else
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -v db_password="$DB_PASSWORD" <<'SQL'
CREATE ROLE helzerx_api WITH LOGIN PASSWORD :'db_password';
SQL
fi

if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='helzerx_orders'" | grep -q '^1$'; then
  runuser -u postgres -- createdb -O helzerx_api helzerx_orders
fi
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d helzerx_orders -c "GRANT ALL ON SCHEMA public TO helzerx_api;" >/dev/null

NEW_DATABASE_URL="postgres://helzerx_api:${DB_PASSWORD}@127.0.0.1:5432/helzerx_orders"
export NEW_DATABASE_URL
python3 - "$ENV_FILE" <<'PY'
import os, pathlib, re, sys
p = pathlib.Path(sys.argv[1])
text = p.read_text()
replacement = 'DATABASE_URL=' + os.environ['NEW_DATABASE_URL']
pattern = re.compile(r'^\s*DATABASE_URL\s*=.*$', re.M)
if not pattern.search(text):
    raise SystemExit('DATABASE_URL key is missing; refusing to append ambiguous config')
text = pattern.sub(replacement, text, count=1)
if re.search(r'^\s*DATABASE_SSL\s*=', text, re.M):
    text = re.sub(r'^\s*DATABASE_SSL\s*=.*$', 'DATABASE_SSL=false', text, count=1, flags=re.M)
else:
    text = text.rstrip() + '\nDATABASE_SSL=false\n'
p.write_text(text)
p.chmod(0o600)
PY
unset DB_PASSWORD NEW_DATABASE_URL

log "Applying versioned migrations without deleting existing records."
for migration in "$API/migrations/001_initial.sql" "$API/migrations/002_discord_claim_nullable_user.sql"; do
  [[ -f "$migration" ]] || die "Missing migration: $migration"
  PGPASSWORD="$(node --input-type=module -e "import fs from 'node:fs';const t=fs.readFileSync(process.argv[1],'utf8');const m=t.match(/^DATABASE_URL=(.*)$/m);const u=new URL(m[1]);process.stdout.write(decodeURIComponent(u.password))" "$ENV_FILE")" \
    psql "$(node --input-type=module -e "import fs from 'node:fs';const t=fs.readFileSync(process.argv[1],'utf8');const m=t.match(/^DATABASE_URL=(.*)$/m);process.stdout.write(m[1])" "$ENV_FILE")" -v ON_ERROR_STOP=1 -f "$migration"
done

# The app runtime needs table/sequence privileges; do not grant superuser.
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d helzerx_orders <<'SQL'
GRANT CONNECT ON DATABASE helzerx_orders TO helzerx_api;
GRANT USAGE ON SCHEMA public TO helzerx_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO helzerx_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO helzerx_api;
SQL

log "Checking that API and Discord bot share the same internal auth token."
if [[ -f "$BOT_ENV" ]]; then
  node --input-type=module - "$ENV_FILE" "$BOT_ENV" <<'NODE'
import fs from 'node:fs';
function read(path) {
  const out = {};
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}
const api = read(process.argv[2]), bot = read(process.argv[3]);
if (!api.DISCORD_SERVICE_TOKEN || !bot.DISCORD_SERVICE_TOKEN || api.DISCORD_SERVICE_TOKEN !== bot.DISCORD_SERVICE_TOKEN) {
  console.error('API and bot service tokens are missing or mismatched. Token values were not printed. Keep ordering disabled and correct the secret files.');
  process.exit(4);
}
if (api.DISCORD_GUILD_ID && bot.DISCORD_GUILD_ID && api.DISCORD_GUILD_ID !== bot.DISCORD_GUILD_ID) {
  console.error('API and bot guild IDs do not match. Keep ordering disabled and correct the configuration.');
  process.exit(5);
}
console.log('Discord service token matches; values hidden.');
NODE
else
  log "WARNING: bot env file not found; ordering must remain disabled."
fi

log "Running API tests."
(cd "$API" && npm install --omit=dev && npm test)

log "Installing the public API reverse-proxy snippet if a matching Nginx vhost exists."
install -d -m 755 /etc/nginx/snippets
install -m 644 "$ROOT/deploy/helzerx-cloud-api.conf" /etc/nginx/snippets/helzerx-cloud-api.conf
if command -v nginx >/dev/null && nginx -t >/dev/null 2>&1; then
  python3 - <<'PY'
import pathlib, re, shutil, time
root = pathlib.Path('/etc/nginx/sites-enabled')
domain = 'cloud.helzerx.cyou'
include = 'include /etc/nginx/snippets/helzerx-cloud-api.conf;'
matched = False
if root.exists():
    for path in root.iterdir():
        try:
            original = path.read_text()
        except (OSError, UnicodeDecodeError):
            continue
        lines = original.splitlines(True)
        i = 0
        changed = False
        while i < len(lines):
            if not re.search(r'\bserver\s*\{', lines[i]):
                i += 1
                continue
            start = i
            depth = 0
            end = None
            names = []
            for j in range(start, len(lines)):
                clean = lines[j].split('#', 1)[0]
                names.extend(re.findall(r'\bserver_name\s+([^;]+);', clean))
                depth += clean.count('{') - clean.count('}')
                if j > start and depth == 0:
                    end = j
                    break
            if end is None:
                break
            if any(domain in n.split() for n in names):
                matched = True
                block = ''.join(lines[start:end+1])
                if include not in block:
                    backup = pathlib.Path('/root') / f'helzerx-nginx-{path.name.replace("/", "_")}-{int(time.time())}.bak'
                    shutil.copy2(path, backup)
                    lines.insert(end, '    ' + include + '\n')
                    changed = True
                    end += 1
            i = end + 1
        if changed:
            path.write_text(''.join(lines))
if not matched:
    print('No Nginx server_name for cloud.helzerx.cyou found; proxy was not injected.')
    raise SystemExit(2)
print('Nginx API proxy include is present.')
PY
  NGINX_PATCH_STATUS=$?
  if [[ $NGINX_PATCH_STATUS -eq 0 ]]; then
    nginx -t
    systemctl reload nginx
  else
    log "WARNING: Nginx vhost was not patched. The website must include /etc/nginx/snippets/helzerx-cloud-api.conf inside its cloud.helzerx.cyou HTTPS server block."
  fi
else
  log "WARNING: Nginx is not available or its current configuration is invalid; public API routing was not changed."
fi

log "Building frontend and restarting existing order API/bot services."
npm install
npm run build
systemctl restart helzerx-cloud-order-api.service
if systemctl list-unit-files helzerx-cloud-bot.service --no-legend 2>/dev/null | grep -q helzerx-cloud-bot.service; then
  systemctl restart helzerx-cloud-bot.service
fi

log "Local API checks."
curl --fail --silent --show-error http://127.0.0.1:3100/healthz
printf '\n'
curl --fail --silent --show-error http://127.0.0.1:3100/readyz
printf '\n'
curl --fail --silent --show-error http://127.0.0.1:3100/api/v1/status
printf '\n'

log "Repair finished. ORDERING_ENABLED was intentionally NOT changed."
log "Before enabling orders, verify the public /api/v1/status route, Discord /claim ticket creation, current plan prices, staff review, and actual provisioning workflow."
