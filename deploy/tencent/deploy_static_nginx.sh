#!/usr/bin/env bash
set -euo pipefail

DOMAIN=""
ALIASES=""
EMAIL=""
REPO_DIR=""
WWW_ROOT="/var/www/shiran"
SITE_NAME="shiran"
ENABLE_SSL="false"
INSTALL_DEPS="true"

usage() {
  cat <<'EOF'
Usage:
  sudo bash deploy/tencent/deploy_static_nginx.sh \
    --domain shiran.example.com \
    --repo-dir /opt/shiran \
    --www-root /var/www/shiran \
    --site-name shiran \
    --aliases www.shiran.example.com \
    --enable-ssl true \
    --email you@example.com

Options:
  --domain       Required. Main domain for this site.
  --aliases      Optional. Extra domains, comma separated.
  --repo-dir     Optional. Source repo path on server. Default: current directory.
  --www-root     Optional. Nginx web root. Default: /var/www/shiran
  --site-name    Optional. Nginx site name. Default: shiran
  --enable-ssl   Optional. true/false. Default: false
  --email        Optional. Required when --enable-ssl true
  --install-deps Optional. true/false. Default: true
EOF
}

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy][error] %s\n' "$*" >&2
  exit 1
}

escape_regex() {
  printf '%s' "$1" | sed -E 's/[][(){}.+*?^$|\\]/\\&/g'
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --domain)
        DOMAIN="${2:-}"
        shift 2
        ;;
      --aliases)
        ALIASES="${2:-}"
        shift 2
        ;;
      --email)
        EMAIL="${2:-}"
        shift 2
        ;;
      --repo-dir)
        REPO_DIR="${2:-}"
        shift 2
        ;;
      --www-root)
        WWW_ROOT="${2:-}"
        shift 2
        ;;
      --site-name)
        SITE_NAME="${2:-}"
        shift 2
        ;;
      --enable-ssl)
        ENABLE_SSL="${2:-false}"
        shift 2
        ;;
      --install-deps)
        INSTALL_DEPS="${2:-true}"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        fail "Unknown argument: $1"
        ;;
    esac
  done
}

install_dependencies() {
  if [[ "${INSTALL_DEPS}" != "true" ]]; then
    log "Skip dependency install."
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    log "Installing dependencies via apt..."
    apt-get update -y
    apt-get install -y nginx rsync curl
    if [[ "${ENABLE_SSL}" == "true" ]]; then
      apt-get install -y certbot python3-certbot-nginx
    fi
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    log "Installing dependencies via yum..."
    yum install -y nginx rsync curl
    if [[ "${ENABLE_SSL}" == "true" ]]; then
      yum install -y certbot python3-certbot-nginx || true
    fi
    return
  fi

  fail "Unsupported package manager. Install nginx/rsync/certbot manually."
}

sync_files() {
  [[ -d "${REPO_DIR}" ]] || fail "Repo dir not found: ${REPO_DIR}"
  mkdir -p "${WWW_ROOT}"
  log "Sync files to ${WWW_ROOT} ..."
  rsync -a --delete \
    --exclude '.git' \
    --exclude '.github' \
    --exclude 'node_modules' \
    "${REPO_DIR}/" "${WWW_ROOT}/"
}

build_server_names() {
  local names="${DOMAIN}"
  if [[ -n "${ALIASES}" ]]; then
    names="${names} ${ALIASES//,/ }"
  fi
  printf '%s' "${names}"
}

check_domain_conflict() {
  local escaped
  escaped="$(escape_regex "${DOMAIN}")"
  if nginx -T 2>/dev/null | grep -E "server_name[^;]*${escaped}([ ;]|$)" >/dev/null 2>&1; then
    fail "Domain ${DOMAIN} already appears in existing nginx config. Please use another domain/subdomain or merge manually."
  fi
}

write_nginx_config() {
  local server_names="$1"
  local tmp_conf
  tmp_conf="$(mktemp)"

  cat > "${tmp_conf}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${server_names};

    root ${WWW_ROOT};
    index index.html;

    location = / {
        return 302 /main_program/;
    }

    location / {
        try_files \$uri \$uri/ =404;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf)$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
    }

    location ~* \.json$ {
        add_header Cache-Control "no-cache, must-revalidate";
    }
}
EOF

  if [[ -d /etc/nginx/sites-available ]]; then
    local target="/etc/nginx/sites-available/${SITE_NAME}.conf"
    cp "${tmp_conf}" "${target}"
    ln -sf "${target}" "/etc/nginx/sites-enabled/${SITE_NAME}.conf"
    rm -f "${tmp_conf}"
    log "Wrote nginx config: ${target}"
    return
  fi

  local target="/etc/nginx/conf.d/${SITE_NAME}.conf"
  cp "${tmp_conf}" "${target}"
  rm -f "${tmp_conf}"
  log "Wrote nginx config: ${target}"
}

reload_nginx() {
  nginx -t
  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl restart nginx
  log "Nginx reloaded."
}

check_port_ownership() {
  command -v ss >/dev/null 2>&1 || return 0

  local p80
  local p443
  p80="$(ss -ltnp '( sport = :80 )' 2>/dev/null | awk 'NR>1 {print $0}')"
  p443="$(ss -ltnp '( sport = :443 )' 2>/dev/null | awk 'NR>1 {print $0}')"

  if [[ -n "${p80}" ]] && ! echo "${p80}" | grep -qi "nginx"; then
    fail "Port 80 is occupied by a non-nginx process. Keep existing gateway and route Shiran there, or free port 80 first."
  fi
  if [[ -n "${p443}" ]] && ! echo "${p443}" | grep -qi "nginx"; then
    fail "Port 443 is occupied by a non-nginx process. Keep existing gateway and route Shiran there, or free port 443 first."
  fi
}

enable_ssl() {
  [[ "${ENABLE_SSL}" == "true" ]] || return 0
  [[ -n "${EMAIL}" ]] || fail "--email is required when --enable-ssl true"
  command -v certbot >/dev/null 2>&1 || fail "certbot not found. Install certbot first."

  local certbot_args=("--nginx" "--non-interactive" "--agree-tos" "--redirect" "-m" "${EMAIL}" "-d" "${DOMAIN}")
  if [[ -n "${ALIASES}" ]]; then
    IFS=',' read -ra items <<< "${ALIASES}"
    for d in "${items[@]}"; do
      local trimmed
      trimmed="$(echo "${d}" | xargs)"
      [[ -n "${trimmed}" ]] && certbot_args+=("-d" "${trimmed}")
    done
  fi

  log "Applying SSL certificate via certbot..."
  certbot "${certbot_args[@]}"
  nginx -t
  systemctl reload nginx
}

main() {
  parse_args "$@"
  [[ "$(id -u)" -eq 0 ]] || fail "Run as root (sudo)."
  [[ -n "${DOMAIN}" ]] || fail "--domain is required"
  if [[ -z "${REPO_DIR}" ]]; then
    REPO_DIR="$(pwd)"
  fi

  install_dependencies
  check_domain_conflict
  check_port_ownership
  sync_files
  write_nginx_config "$(build_server_names)"
  reload_nginx
  enable_ssl

  log "Deploy complete."
  log "Site URL: http://${DOMAIN}/main_program/"
  if [[ "${ENABLE_SSL}" == "true" ]]; then
    log "Site URL: https://${DOMAIN}/main_program/"
  fi
}

main "$@"
