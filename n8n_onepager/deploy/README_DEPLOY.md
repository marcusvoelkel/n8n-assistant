# Deploy n8nAI Onepager (Ubuntu 22.04 + Nginx + Certbot + Node)

Steps (non-destructive; do not touch existing apps):

1) DNS
- Create A record for `n8nai.io` and `www.n8nai.io` → server IP.

2) Server prep (as root)
```
adduser --system --group --home /var/www/n8nai.io n8nai || true
mkdir -p /var/www/n8nai.io/public /var/www/n8nai.io/server
chown -R n8nai:www-data /var/www/n8nai.io
apt-get update && apt-get install -y nginx certbot python3-certbot-nginx nodejs npm
```

3) Upload site
- Copy `public/*` → `/var/www/n8nai.io/public`
- Copy `server/*` → `/var/www/n8nai.io/server`
- Create `/var/www/n8nai.io/server/.env` (see `.env.example`).

4) Nginx
```
cp deploy/nginx.n8nai.io.conf.example /etc/nginx/sites-available/n8nai.io
ln -s /etc/nginx/sites-available/n8nai.io /etc/nginx/sites-enabled/n8nai.io
nginx -t && systemctl reload nginx
```

5) TLS (Let’s Encrypt)
```
certbot --nginx -d n8nai.io -d www.n8nai.io --redirect --non-interactive --agree-tos -m waitlist@n8nai.io
```

6) Waitlist service (systemd)
```
cp deploy/systemd-n8nai-waitlist.service.example /etc/systemd/system/n8nai-waitlist.service
systemctl daemon-reload
systemctl enable --now n8nai-waitlist
systemctl status n8nai-waitlist
```

7) Verify
- https://n8nai.io/ (EN), https://n8nai.io/de/ (DE), https://n8nai.io/privacy.html
- Submit the waitlist form → email to waitlist@n8nai.io

Notes
- Do not commit real secrets. Use `.env` on server.
- If Node is managed by a process manager you prefer (e.g., pm2), adapt accordingly.

