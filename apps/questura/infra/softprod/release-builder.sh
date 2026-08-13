#!/usr/bin/env bash
# Build and publish immutable, commit-addressed Questura release snapshots.
# shellcheck shell=bash

SOFTPROD_SOURCE_REPO=${SOURCE_REPO:?SOURCE_REPO must be set before sourcing release-builder.sh}
SOFTPROD_CONFIG_ROOT=${CONFIG_ROOT:?CONFIG_ROOT must be set before sourcing release-builder.sh}
SOFTPROD_STAGING=''

config_path() {
  case "$1" in
    server) printf '%s\n' "$SOFTPROD_CONFIG_ROOT/server.env" ;;
    client) printf '%s\n' "$SOFTPROD_CONFIG_ROOT/client.env" ;;
    *) echo "ERROR: unknown component: $1" >&2; return 1 ;;
  esac
}

config_destination() {
  local release=$1
  case "$2" in
    server) printf '%s\n' "$release/apps/questura/apps/server/.env" ;;
    client) printf '%s\n' "$release/apps/questura/apps/client/.env.production.local" ;;
    *) echo "ERROR: unknown component: $2" >&2; return 1 ;;
  esac
}

config_fingerprint() {
  local source
  source=$(config_path "$1") || return
  if [[ ! -r $source || ! -f $source ]]; then
    echo "ERROR: release config is missing or unreadable: $source" >&2
    return 1
  fi
  python3 - "$source" <<'PY'
import hashlib
import pathlib
import sys
print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())
PY
}

tree_fingerprint() {
  local root=$1
  local mode=$2

  python3 - "$root" "$mode" <<'PY'
import hashlib
import os
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
mode = sys.argv[2]
if mode == "server":
    excluded_prefix = pathlib.PurePosixPath("apps/questura/apps/client")
    excluded_names = {".questura", "node_modules"}
    excluded_files = {".env", ".env.production.local", ".env.release"}
elif mode == "client":
    excluded_prefix = None
    excluded_names = {".questura", "node_modules"}
    excluded_files = {".env", ".env.production.local", ".env.release"}
elif mode == "dependencies":
    excluded_prefix = None
    excluded_names = set()
    excluded_files = set()
else:
    raise SystemExit(f"unknown fingerprint mode: {mode}")

digest = hashlib.sha256()

for current, directories, files in os.walk(root, followlinks=False):
    current_path = pathlib.Path(current)
    relative_current = current_path.relative_to(root)
    directories[:] = sorted(name for name in directories if name not in excluded_names)
    if mode != "dependencies" and relative_current.name == ".next":
        directories[:] = [name for name in directories if name != "cache"]
    if excluded_prefix is not None:
        directories[:] = [
            name
            for name in directories
            if not (relative_current / name).as_posix().startswith(excluded_prefix.as_posix())
        ]

    for name in list(directories):
        path = current_path / name
        if path.is_symlink():
            relative = path.relative_to(root).as_posix()
            digest.update(f"L\0{relative}\0{os.readlink(path)}\0".encode())
            directories.remove(name)

    for name in sorted(files):
        if name in excluded_files:
            continue
        path = current_path / name
        relative = path.relative_to(root).as_posix()
        if path.is_symlink():
            digest.update(f"L\0{relative}\0{os.readlink(path)}\0".encode())
        else:
            digest.update(f"F\0{relative}\0".encode())
            with path.open("rb") as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(chunk)
            digest.update(b"\0")

print(digest.hexdigest())
PY
}

artifact_fingerprint() {
  local release=$1
  local component=$2
  local root

  case "$component" in
    server) root=$release ;;
    client) root="$release/apps/questura/apps/client" ;;
    *) echo "ERROR: unknown component: $component" >&2; return 1 ;;
  esac
  tree_fingerprint "$root" "$component"
}

dependency_fingerprint() {
  local release=$1
  local directory="$release/node_modules"

  if [[ ! -d $directory ]]; then
    echo "ERROR: release dependencies are missing: $directory" >&2
    return 1
  fi
  tree_fingerprint "$directory" dependencies
}

ensure_config_link() {
  local release=$1
  local component=$2
  local source destination actual_source actual_destination

  source=$(config_path "$component") || return
  config_fingerprint "$component" >/dev/null || return
  destination=$(config_destination "$release" "$component") || return
  actual_source=$(canonical_path "$source") || return

  if [[ -L $destination ]]; then
    actual_destination=$(canonical_path "$destination") || return
    if [[ $actual_destination != "$actual_source" ]]; then
      echo "ERROR: release config link points at unexpected file: $destination" >&2
      return 1
    fi
    return 0
  fi
  if [[ -e $destination ]]; then
    echo "ERROR: release config path exists and is not a symlink: $destination" >&2
    return 1
  fi
  atomic_symlink "$source" "$destination"
}

validate_config_link() {
  local release=$1
  local component=$2
  local source destination actual_source actual_destination

  source=$(config_path "$component") || return
  config_fingerprint "$component" >/dev/null || return
  destination=$(config_destination "$release" "$component") || return
  if [[ ! -L $destination ]]; then
    echo "ERROR: published release config link is missing: $destination" >&2
    return 1
  fi
  actual_source=$(canonical_path "$source") || return
  actual_destination=$(canonical_path "$destination") || return
  if [[ $actual_destination != "$actual_source" ]]; then
    echo "ERROR: published release config link points at unexpected file: $destination" >&2
    return 1
  fi
}

write_release_metadata() {
  local release=$1
  local sha=$2
  local component directory

  for component in server client; do
    directory="$release/apps/questura/apps/$component"
    printf 'QUESTURA_RELEASE_SHA=%s\n' "$sha" > "$directory/.env.release"
  done
}

marker_path() {
  local release=$1
  local marker=$2
  printf '%s\n' "$release/.questura/$marker"
}

write_release_inputs() {
  local release=$1
  local sha=$2
  local server_fingerprint=$3
  local client_fingerprint=$4
  local path="$release/.questura/release-inputs"
  local temporary

  mkdir -p "$(dirname -- "$path")"
  temporary=$(mktemp "$(dirname -- "$path")/.release-inputs.XXXXXX") || return
  printf 'QUESTURA_RELEASE_SHA=%s\nQUESTURA_SERVER_CONFIG_SHA256=%s\nQUESTURA_CLIENT_CONFIG_SHA256=%s\n' \
    "$sha" "$server_fingerprint" "$client_fingerprint" > "$temporary"
  chmod 0600 "$temporary"
  mv -f "$temporary" "$path"
}

validate_release_inputs() {
  local release=$1
  local sha=$2
  local server_fingerprint client_fingerprint expected actual
  local path="$release/.questura/release-inputs"

  server_fingerprint=$(config_fingerprint server) || return
  client_fingerprint=$(config_fingerprint client) || return
  if [[ ! -f $path ]]; then
    echo "ERROR: release input fingerprint is missing: $path" >&2
    return 1
  fi
  expected=$(printf 'QUESTURA_RELEASE_SHA=%s\nQUESTURA_SERVER_CONFIG_SHA256=%s\nQUESTURA_CLIENT_CONFIG_SHA256=%s' \
    "$sha" "$server_fingerprint" "$client_fingerprint")
  actual=$(cat "$path") || return
  if [[ $actual != "$expected" ]]; then
    echo "ERROR: release inputs changed; create a new commit before deploying config changes: $path" >&2
    return 1
  fi
}

write_marker() {
  local release=$1
  local marker=$2
  local component=$3
  local sha=$4
  local expected_config_fingerprint=$5
  local fingerprint artifact dependencies temporary path

  fingerprint=$(config_fingerprint "$component") || return
  if [[ $fingerprint != "$expected_config_fingerprint" ]]; then
    echo "ERROR: $component config changed during build; release was not certified" >&2
    return 1
  fi
  artifact=$(artifact_fingerprint "$release" "$component") || return
  dependencies=$(dependency_fingerprint "$release") || return
  path=$(marker_path "$release" "$marker") || return
  mkdir -p "$(dirname -- "$path")"
  temporary=$(mktemp "$(dirname -- "$path")/.$marker.XXXXXX") || return
  printf 'QUESTURA_RELEASE_SHA=%s\nQUESTURA_CONFIG_SHA256=%s\nQUESTURA_ARTIFACT_SHA256=%s\nQUESTURA_DEPENDENCY_SHA256=%s\n' \
    "$sha" "$fingerprint" "$artifact" "$dependencies" > "$temporary"
  chmod 0600 "$temporary"
  mv -f "$temporary" "$path"
}

validate_marker() {
  local release=$1
  local marker=$2
  local component=$3
  local sha=$4
  local fingerprint artifact dependencies path expected actual

  fingerprint=$(config_fingerprint "$component") || return
  artifact=$(artifact_fingerprint "$release" "$component") || return
  dependencies=$(dependency_fingerprint "$release") || return
  path=$(marker_path "$release" "$marker") || return
  if [[ ! -f $path ]]; then
    return 2
  fi
  expected=$(printf 'QUESTURA_RELEASE_SHA=%s\nQUESTURA_CONFIG_SHA256=%s\nQUESTURA_ARTIFACT_SHA256=%s\nQUESTURA_DEPENDENCY_SHA256=%s' \
    "$sha" "$fingerprint" "$artifact" "$dependencies")
  actual=$(cat "$path") || return
  if [[ $actual != "$expected" ]]; then
    echo "ERROR: $marker state does not match commit/config/artifacts/dependencies; create a new commit before deploying config changes: $path" >&2
    return 1
  fi
}

validate_server_release() {
  local sha=$1
  local release="$SOFTPROD_RELEASES/$sha"

  require_component_release_directory server "$release/apps/questura/apps/server" || return
  require_component_release_directory client "$release/apps/questura/apps/client" || return
  [[ $(release_sha "$release/apps/questura/apps/server") == "$sha" ]] || return
  [[ $(release_sha "$release/apps/questura/apps/client") == "$sha" ]] || return
  validate_config_link "$release" server || return
  validate_config_link "$release" client || return
  validate_release_inputs "$release" "$sha" || return
  validate_marker "$release" server-ready server "$sha"
}

require_complete_release() {
  local sha=$1
  local release="$SOFTPROD_RELEASES/$sha"

  validate_server_release "$sha" || return
  validate_marker "$release" release-ready client "$sha" || {
    echo "ERROR: release is not complete: $release" >&2
    return 1
  }
}

cleanup_release_staging() {
  local root staging
  if [[ -z $SOFTPROD_STAGING || ! -e $SOFTPROD_STAGING ]]; then return 0; fi
  root=$(canonical_path "$SOFTPROD_RELEASES") || return
  staging=$(canonical_path "$SOFTPROD_STAGING") || return
  if [[ $staging != "$root/".staging-* ]]; then
    echo "CRITICAL: refusing to clean unexpected staging path: $SOFTPROD_STAGING" >&2
    return 1
  fi
  rm -rf -- "$staging" || return
  SOFTPROD_STAGING=''
}

prepare_server_release() {
  local sha=$1
  local release="$SOFTPROD_RELEASES/$sha"
  local server_config_before client_config_before

  if [[ ! $sha =~ ^[0-9a-f]{40}$ ]]; then
    echo "ERROR: release SHA must be 40 lowercase hex characters: $sha" >&2
    return 1
  fi
  config_fingerprint server >/dev/null || return
  config_fingerprint client >/dev/null || return
  server_config_before=$(config_fingerprint server) || return
  client_config_before=$(config_fingerprint client) || return
  mkdir -p "$SOFTPROD_RELEASES"

  if [[ -L $release ]]; then
    echo "ERROR: release path must not be a symlink: $release" >&2
    return 1
  fi
  if [[ -e $release ]]; then
    if [[ ! -d $release ]]; then
      echo "ERROR: release path is not a directory: $release" >&2
      return 1
    fi
    validate_server_release "$sha" || return
    return 0
  fi

  git -C "$SOFTPROD_SOURCE_REPO" cat-file -e "$sha^{commit}" || return
  SOFTPROD_STAGING=$(mktemp -d "$SOFTPROD_RELEASES/.staging-$sha.XXXXXX") || return
  git -C "$SOFTPROD_SOURCE_REPO" archive "$sha" | tar -x -C "$SOFTPROD_STAGING"
  write_release_metadata "$SOFTPROD_STAGING" "$sha"
  ensure_config_link "$SOFTPROD_STAGING" server
  ensure_config_link "$SOFTPROD_STAGING" client
  write_release_inputs "$SOFTPROD_STAGING" "$sha" "$server_config_before" "$client_config_before"

  stage="dependency installation"
  echo "==> Installing locked dependencies (Questura workspaces only)"
  cd "$SOFTPROD_STAGING"
  pnpm install --frozen-lockfile --prod=false \
    --filter "@questura/server..." \
    --filter "@questura/client..."

  stage="server build"
  echo "==> Building server"
  cd "$SOFTPROD_STAGING/apps/questura/apps/server"
  pnpm build

  stage="server tests"
  echo "==> Testing server"
  pnpm test

  stage="server lint"
  echo "==> Linting server"
  pnpm lint
  validate_release_inputs "$SOFTPROD_STAGING" "$sha"
  write_marker "$SOFTPROD_STAGING" server-ready server "$sha" "$server_config_before"

  stage="server release publication"
  if [[ -e $release ]]; then
    echo "ERROR: release appeared while staging: $release" >&2
    return 1
  fi
  mv "$SOFTPROD_STAGING" "$release"
  SOFTPROD_STAGING=''

  validate_marker "$release" server-ready server "$sha"
}

complete_client_release() {
  local sha=$1
  local release="$SOFTPROD_RELEASES/$sha"
  local marker_status=0
  local client_config_before

  validate_server_release "$sha" || return
  validate_marker "$release" release-ready client "$sha" || marker_status=$?
  if ((marker_status == 0)); then return 0; fi
  if ((marker_status != 2)); then return "$marker_status"; fi
  client_config_before=$(config_fingerprint client) || return

  stage="client build"
  echo "==> Building client"
  cd "$release/apps/questura/apps/client"
  pnpm build
  validate_release_inputs "$release" "$sha"
  write_marker "$release" release-ready client "$sha" "$client_config_before"
  validate_marker "$release" release-ready client "$sha"
}
