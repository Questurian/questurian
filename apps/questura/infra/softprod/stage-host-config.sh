#!/usr/bin/env bash
# Stage canonical host config and rendered units without changing live services.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
HOST_SOURCE="$SCRIPT_DIR/host"
DEPLOY_ROOT=${QUESTURA_DEPLOY_ROOT:-"$HOME/questura"}
APP_ROOT=${QUESTURA_APP_ROOT:-"$DEPLOY_ROOT/app"}
INFRA_ROOT=${QUESTURA_INFRA_ROOT:-"$DEPLOY_ROOT/infra"}
CONFIG_ROOT=${QUESTURA_CONFIG_ROOT:-"$DEPLOY_ROOT/config"}
RENDERED_ROOT=${QUESTURA_RENDERED_UNITS_ROOT:-"$INFRA_ROOT/systemd"}
SERVER_ENV_SOURCE=${QUESTURA_SERVER_ENV_SOURCE:-"$APP_ROOT/apps/questura/apps/server/.env"}
CLIENT_ENV_SOURCE=${QUESTURA_CLIENT_ENV_SOURCE:-"$APP_ROOT/apps/questura/apps/client/.env.production.local"}
EXISTING_COMPOSE=${QUESTURA_EXISTING_COMPOSE:-"$INFRA_ROOT/compose.yml"}
stage_directory=''

cleanup() {
  if [[ -n $stage_directory && -d $stage_directory && $stage_directory == "$DEPLOY_ROOT/".host-config.* ]]; then
    rm -rf -- "$stage_directory"
  fi
}
trap cleanup EXIT

if (($# > 0)); then
  echo "ERROR: stage-host-config.sh takes no arguments" >&2
  exit 2
fi

mkdir -p "$DEPLOY_ROOT"
exec 9>"$DEPLOY_ROOT/deploy.lock"
if ! flock -n 9; then
  echo "ERROR: another Questura deploy or host-config operation is running" >&2
  exit 1
fi

require_regular_file() {
  local path=$1
  if [[ ! -f $path || ! -r $path ]]; then
    echo "ERROR: required readable file is missing: $path" >&2
    return 1
  fi
}

require_regular_file "$SERVER_ENV_SOURCE"
require_regular_file "$CLIENT_ENV_SOURCE"
require_regular_file "$HOST_SOURCE/compose.yml"
require_regular_file "$HOST_SOURCE/tunnel-config.yml"

PNPM_BIN=${QUESTURA_PNPM_BIN:-}
if [[ -z $PNPM_BIN ]]; then
  export NVM_DIR=${NVM_DIR:-"$HOME/.nvm"}
  if [[ -s $NVM_DIR/nvm.sh ]]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
    nvm use "${QUESTURA_NODE_VERSION:-22}" >/dev/null
  fi
  PNPM_BIN=$(command -v pnpm || true)
fi
CLOUDFLARED_BIN=${QUESTURA_CLOUDFLARED_BIN:-$(command -v cloudflared || true)}
NODE_BIN_DIR=${QUESTURA_NODE_BIN_DIR:-$(dirname -- "$PNPM_BIN")}

for binary in "$PNPM_BIN" "$CLOUDFLARED_BIN"; do
  if [[ $binary != /* || ! -x $binary ]]; then
    echo "ERROR: required executable has no absolute executable path: ${binary:-missing}" >&2
    exit 1
  fi
done

stage_directory=$(mktemp -d "$DEPLOY_ROOT/.host-config.XXXXXX")
mkdir -p "$stage_directory/config" "$stage_directory/infra/systemd"
install -m 0600 "$SERVER_ENV_SOURCE" "$stage_directory/config/server.env"
install -m 0600 "$CLIENT_ENV_SOURCE" "$stage_directory/config/client.env"
install -m 0644 "$HOST_SOURCE/compose.yml" "$stage_directory/infra/compose.yml"
install -m 0644 "$HOST_SOURCE/tunnel-config.yml" "$stage_directory/infra/tunnel-config.yml"

expected_compose_json="$stage_directory/expected-compose.json"
if [[ -f $INFRA_ROOT/.env ]]; then
  docker compose \
    --env-file "$INFRA_ROOT/.env" \
    -f "$EXISTING_COMPOSE" \
    config --format json > "$expected_compose_json"
  install -m 0600 "$INFRA_ROOT/.env" "$stage_directory/infra/.env"
else
  require_regular_file "$EXISTING_COMPOSE"
  docker compose -f "$EXISTING_COMPOSE" config --format json > "$expected_compose_json"
  python3 - "$expected_compose_json" "$stage_directory/infra/.env" <<'PY'
import json
import pathlib
import sys

source = pathlib.Path(sys.argv[1])
output = pathlib.Path(sys.argv[2])
document = json.loads(source.read_text(encoding="utf-8"))
environment = document["services"]["postgres"]["environment"]
if isinstance(environment, list):
    values = dict(item.split("=", 1) for item in environment)
else:
    values = environment
password = values.get("POSTGRES_PASSWORD")
if not isinstance(password, str) or not password:
    raise SystemExit("Postgres password was not found in existing Compose config")
if "\0" in password:
    raise SystemExit("Postgres password contains an unsupported NUL byte")
# JSON quoting matches Compose double-quoted dotenv escapes. Double dollar signs
# suppress Compose interpolation while preserving one literal dollar at runtime.
encoded = json.dumps(password).replace("$", "$$")
output.write_text(f"POSTGRES_PASSWORD={encoded}\n", encoding="utf-8")
PY
  chmod 0600 "$stage_directory/infra/.env"
fi

render_unit() {
  local source=$1
  local destination=$2
  python3 - "$source" "$destination" "$NODE_BIN_DIR" "$PNPM_BIN" "$CLOUDFLARED_BIN" <<'PY'
import pathlib
import sys

source, destination, node_bin_dir, pnpm_bin, cloudflared_bin = sys.argv[1:]
text = pathlib.Path(source).read_text(encoding="utf-8")
replacements = {
    "@NODE_BIN_DIR@": node_bin_dir,
    "@PNPM_BIN@": pnpm_bin,
    "@CLOUDFLARED_BIN@": cloudflared_bin,
}
for marker, value in replacements.items():
    text = text.replace(marker, value)
if "@" in "\n".join(line for line in text.splitlines() if line.startswith(("Environment=PATH=", "ExecStart="))):
    raise SystemExit(f"unrendered unit placeholder in {source}")
pathlib.Path(destination).write_text(text, encoding="utf-8")
PY
  chmod 0644 "$destination"
}

for template in "$HOST_SOURCE/systemd"/*.service.in "$HOST_SOURCE/systemd"/*.timer.in; do
  unit_name=$(basename -- "$template" .in)
  render_unit "$template" "$stage_directory/infra/systemd/$unit_name"
done

docker compose \
  --env-file "$stage_directory/infra/.env" \
  -f "$stage_directory/infra/compose.yml" \
  config --quiet
rendered_compose_json="$stage_directory/rendered-compose.json"
docker compose \
  --env-file "$stage_directory/infra/.env" \
  -f "$stage_directory/infra/compose.yml" \
  config --format json > "$rendered_compose_json"
python3 - "$expected_compose_json" "$rendered_compose_json" <<'PY'
import json
import pathlib
import sys

def password(path: str) -> str:
    document = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    environment = document["services"]["postgres"]["environment"]
    if isinstance(environment, list):
        values = dict(item.split("=", 1) for item in environment)
    else:
        values = environment
    value = values.get("POSTGRES_PASSWORD")
    if not isinstance(value, str):
        raise SystemExit("Postgres password is absent from rendered Compose config")
    return value

if password(sys.argv[1]) != password(sys.argv[2]):
    raise SystemExit("Postgres password changed during Compose config migration")
PY
"$CLOUDFLARED_BIN" \
  --config "$stage_directory/infra/tunnel-config.yml" \
  tunnel ingress validate
systemd-analyze --user verify \
  "$stage_directory/infra/systemd"/*.service \
  "$stage_directory/infra/systemd"/*.timer

for pair in \
  "$stage_directory/config/server.env:$CONFIG_ROOT/server.env" \
  "$stage_directory/config/client.env:$CONFIG_ROOT/client.env"; do
  source_file=${pair%%:*}
  destination_file=${pair#*:}
  if [[ -e $destination_file ]] && ! cmp -s "$source_file" "$destination_file"; then
    echo "ERROR: existing canonical config differs; refusing overwrite: $destination_file" >&2
    exit 1
  fi
done

mkdir -p "$DEPLOY_ROOT/backups/host-config"
backup_directory=$(mktemp -d "$DEPLOY_ROOT/backups/host-config/config.XXXXXX")
for path in \
  "$CONFIG_ROOT/server.env" \
  "$CONFIG_ROOT/client.env" \
  "$INFRA_ROOT/.env" \
  "$INFRA_ROOT/compose.yml" \
  "$INFRA_ROOT/tunnel-config.yml" \
  "$RENDERED_ROOT"; do
  if [[ -e $path ]]; then cp -a "$path" "$backup_directory/"; fi
done

mkdir -p "$CONFIG_ROOT" "$INFRA_ROOT" "$RENDERED_ROOT"
chmod 0700 "$CONFIG_ROOT"
install -m 0600 "$stage_directory/config/server.env" "$CONFIG_ROOT/server.env"
install -m 0600 "$stage_directory/config/client.env" "$CONFIG_ROOT/client.env"
install -m 0600 "$stage_directory/infra/.env" "$INFRA_ROOT/.env"
install -m 0644 "$stage_directory/infra/compose.yml" "$INFRA_ROOT/compose.yml"
install -m 0644 "$stage_directory/infra/tunnel-config.yml" "$INFRA_ROOT/tunnel-config.yml"
for unit in "$stage_directory/infra/systemd"/*.service "$stage_directory/infra/systemd"/*.timer; do
  install -m 0644 "$unit" "$RENDERED_ROOT/$(basename -- "$unit")"
done

echo "Staged canonical host config. Active services and unit files were not changed."
echo "Backup: $backup_directory"
