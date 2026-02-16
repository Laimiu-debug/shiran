# Tencent Cloud Deployment (Coexist with Existing App)

This project is a static site. The safest production setup on a Tencent Cloud CVM is:

- Use one Nginx service.
- Add one new virtual host (`server_name`) for Shiran.
- Keep the existing app on its own domain/subdomain.

If domains are different, deployments do not conflict.

## Will it affect your existing app?

Usually no, if all of these are true:

1. Existing app and Shiran use different domain/subdomain.
2. You add a new nginx server block (do not overwrite existing one).
3. You do not change existing app upstream ports.

Possible conflict cases:

1. Reusing the same domain.
2. Existing app directly owns ports `80/443` without nginx routing.
3. Replacing nginx default config instead of adding a new site file.

## One-command deployment on CVM

Run on your Tencent Cloud server:

```bash
sudo bash deploy/tencent/deploy_static_nginx.sh \
  --domain your-domain.com \
  --aliases www.your-domain.com \
  --repo-dir /opt/shiran \
  --www-root /var/www/shiran \
  --site-name shiran \
  --enable-ssl true \
  --email you@example.com
```

### What the script does

1. Installs `nginx` and `rsync` (and `certbot` when SSL enabled).
2. Syncs current repo to `/var/www/shiran`.
3. Adds a dedicated nginx site config.
4. Validates nginx config and reloads service.
5. Optionally applies HTTPS certificate via certbot.

## DNS and Tencent Cloud checks

Before SSL:

1. Add A record:
   - `@` -> your CVM public IP
   - `www` -> your CVM public IP (if using `www`)
2. Open security group ports `80` and `443`.
3. Confirm firewall allows `80/443`.

## Access URL

After deploy:

- `https://your-domain.com/main_program/`
- root path `/` auto-redirects to `/main_program/`

## Notes about content paths

The homepage loads resources from:

- `main_program/`
- `v1_foundation/`
- `model_library/`
- `ExportBlock/`

So deploy the repository root as-is. Do not deploy only `main_program`.

