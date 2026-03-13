# Deployment Guide

This guide covers deploying Project Gauss HUD to production environments.

---

## Prerequisites

- **Node.js** 18+ (20+ recommended)
- **MySQL** 8.0+ database
- **SSL Certificate** (for HTTPS)
- **Domain name** (optional, recommended for production)

---

## Production Build

### 1. Build Backend Server

```bash
# Install dependencies
pnpm install --prod

# Build server bundle
pnpm build

# Output: dist/index.js (28.7kb ESM bundle)
```

### 2. Prepare Mobile App

For mobile deployment, use Expo Application Services (EAS) or build locally:

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure EAS project
eas build:configure

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

---

## Environment Configuration

### 1. Create Production `.env`

```bash
cp .env.example .env.production
```

### 2. Configure Variables

Edit `.env.production`:

```bash
# OAuth Configuration
EXPO_PUBLIC_OAUTH_PORTAL_URL=https://oauth.yourproject.com
EXPO_PUBLIC_OAUTH_SERVER_URL=https://api.yourproject.com
EXPO_PUBLIC_APP_ID=prod_app_12345
EXPO_PUBLIC_OWNER_OPEN_ID=owner_67890
EXPO_PUBLIC_OWNER_NAME=Production Owner

# API Configuration
EXPO_PUBLIC_API_BASE_URL=https://api.yourproject.com

# Database Configuration
DATABASE_URL=mysql://gauss_user:STRONG_PASSWORD@db.yourproject.com:3306/gauss_hud_prod

# Storage Configuration
BUILT_IN_FORGE_API_URL=https://storage.yourproject.com
BUILT_IN_FORGE_API_KEY=sk_prod_...

# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
```

**Security Checklist:**
- [ ] Use strong, randomly generated database passwords
- [ ] Rotate API keys regularly
- [ ] Never commit `.env.production` to version control
- [ ] Use secrets management (e.g., AWS Secrets Manager, HashiCorp Vault)

---

## Database Setup

### 1. Create Production Database

```sql
-- Connect to MySQL
mysql -u root -p

-- Create database
CREATE DATABASE gauss_hud_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create user
CREATE USER 'gauss_user'@'%' IDENTIFIED BY 'STRONG_PASSWORD';

-- Grant permissions
GRANT ALL PRIVILEGES ON gauss_hud_prod.* TO 'gauss_user'@'%';
FLUSH PRIVILEGES;
```

### 2. Run Migrations

```bash
# Load production environment
export $(cat .env.production | xargs)

# Generate and apply migrations
pnpm db:push
```

### 3. Verify Tables

```bash
mysql -u gauss_user -p gauss_hud_prod

SHOW TABLES;

# Expected output:
# +---------------------------+
# | Tables_in_gauss_hud_prod  |
# +---------------------------+
# | feedback                  |
# | operatorSessions          |
# | users                     |
# +---------------------------+
```

---

## Server Deployment

### Option 1: PM2 (Process Manager)

```bash
# Install PM2 globally
npm install -g pm2

# Start server with PM2
pm2 start dist/index.js --name gauss-hud --env production

# Save PM2 configuration
pm2 save

# Set PM2 to start on boot
pm2 startup
```

**PM2 Commands:**
```bash
# View logs
pm2 logs gauss-hud

# Restart server
pm2 restart gauss-hud

# Stop server
pm2 stop gauss-hud

# Monitor performance
pm2 monit
```

### Option 2: Systemd Service

Create `/etc/systemd/system/gauss-hud.service`:

```ini
[Unit]
Description=Project Gauss HUD API Server
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/gauss-hud
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=gauss-hud
Environment=NODE_ENV=production
EnvironmentFile=/opt/gauss-hud/.env.production

[Install]
WantedBy=multi-user.target
```

**Start service:**
```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable on boot
sudo systemctl enable gauss-hud

# Start service
sudo systemctl start gauss-hud

# Check status
sudo systemctl status gauss-hud

# View logs
sudo journalctl -u gauss-hud -f
```

### Option 3: Docker

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --prod

# Copy source
COPY . .

# Build server
RUN pnpm build

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/index.js"]
```

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  gauss-hud:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env.production
    depends_on:
      - mysql
    restart: unless-stopped

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root_password
      MYSQL_DATABASE: gauss_hud_prod
      MYSQL_USER: gauss_user
      MYSQL_PASSWORD: user_password
    volumes:
      - mysql_data:/var/lib/mysql
    restart: unless-stopped

volumes:
  mysql_data:
```

**Deploy with Docker:**
```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f gauss-hud

# Restart
docker-compose restart gauss-hud

# Stop all services
docker-compose down
```

---

## Reverse Proxy (Nginx)

### 1. Install Nginx

```bash
sudo apt update
sudo apt install nginx
```

### 2. Configure SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d api.yourproject.com
```

### 3. Create Nginx Configuration

Create `/etc/nginx/sites-available/gauss-hud`:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name api.yourproject.com;
    return 301 https://$host$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.yourproject.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/api.yourproject.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourproject.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Proxy to Node.js backend
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Static files (optional)
    location / {
        root /var/www/gauss-hud;
        try_files $uri $uri/ =404;
    }
}
```

**Enable site:**
```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/gauss-hud /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## Security Hardening

### 1. Firewall Configuration

```bash
# Allow SSH
sudo ufw allow ssh

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Block direct access to Node.js port
sudo ufw deny 3000/tcp

# Enable firewall
sudo ufw enable
```

### 2. Database Security

```bash
# Run MySQL secure installation
sudo mysql_secure_installation

# Disable remote root login
# Remove anonymous users
# Remove test database
```

**Restrict database access:**
```sql
-- Only allow connections from localhost
CREATE USER 'gauss_user'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON gauss_hud_prod.* TO 'gauss_user'@'localhost';
```

### 3. Environment Variable Security

```bash
# Set proper file permissions
chmod 600 .env.production

# Use secrets manager (AWS Secrets Manager example)
aws secretsmanager create-secret \
  --name gauss-hud/production/database \
  --secret-string '{"url":"mysql://..."}'
```

### 4. Rate Limiting (Nginx)

Add to Nginx config:

```nginx
# Define rate limit zone
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

server {
    # Apply rate limiting to API routes
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        # ... rest of proxy config
    }
}
```

---

## Monitoring & Logging

### 1. Application Logs

**PM2:**
```bash
# View logs
pm2 logs gauss-hud

# Save logs to file
pm2 logs gauss-hud --out /var/log/gauss-hud/out.log --error /var/log/gauss-hud/error.log
```

**Systemd:**
```bash
# View logs
sudo journalctl -u gauss-hud -f

# Save logs to file
sudo journalctl -u gauss-hud > /var/log/gauss-hud/app.log
```

### 2. Database Logs

Enable slow query log in `/etc/mysql/mysql.conf.d/mysqld.cnf`:

```ini
[mysqld]
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow-query.log
long_query_time = 2
```

### 3. Nginx Logs

```bash
# Access logs
tail -f /var/log/nginx/access.log

# Error logs
tail -f /var/log/nginx/error.log
```

### 4. Health Check Endpoint

Add health check to `server/_core/index.ts`:

```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});
```

**Monitor with cron:**
```bash
# Add to crontab
*/5 * * * * curl -f http://localhost:3000/health || systemctl restart gauss-hud
```

---

## Backup Strategy

### 1. Database Backups

```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/mysql"
DB_NAME="gauss_hud_prod"

# Create backup
mysqldump -u gauss_user -p$DB_PASSWORD $DB_NAME > $BACKUP_DIR/gauss_hud_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/gauss_hud_$DATE.sql

# Delete backups older than 30 days
find $BACKUP_DIR -name "gauss_hud_*.sql.gz" -mtime +30 -delete
```

**Schedule with cron:**
```bash
# Add to crontab
0 2 * * * /opt/gauss-hud/scripts/backup-db.sh
```

### 2. Application Backups

```bash
# Backup application code and config
tar -czf /backups/app/gauss-hud_$(date +%Y%m%d).tar.gz /opt/gauss-hud

# Exclude node_modules
tar --exclude='node_modules' -czf /backups/app/gauss-hud_$(date +%Y%m%d).tar.gz /opt/gauss-hud
```

---

## Rollback Procedure

### 1. Revert Code

```bash
# If using Git
cd /opt/gauss-hud
git checkout <previous_commit_hash>
pnpm install
pnpm build
pm2 restart gauss-hud
```

### 2. Restore Database

```bash
# Stop application
pm2 stop gauss-hud

# Restore backup
mysql -u gauss_user -p gauss_hud_prod < /backups/mysql/gauss_hud_20260312.sql

# Start application
pm2 start gauss-hud
```

---

## Production Checklist

### Pre-Deployment
- [ ] Run full test suite (`pnpm test`)
- [ ] Type check (`pnpm check`)
- [ ] Build succeeds (`pnpm build`)
- [ ] All environment variables configured
- [ ] Database migrations applied
- [ ] SSL certificate obtained
- [ ] Backup strategy in place

### Deployment
- [ ] Build server bundle
- [ ] Upload to production server
- [ ] Install dependencies (production only)
- [ ] Configure process manager (PM2/systemd)
- [ ] Configure reverse proxy (Nginx)
- [ ] Enable firewall
- [ ] Test health endpoint
- [ ] Verify API endpoints

### Post-Deployment
- [ ] Monitor logs for errors
- [ ] Test OAuth login flow
- [ ] Test API endpoints
- [ ] Verify database connections
- [ ] Check SSL certificate
- [ ] Monitor performance metrics
- [ ] Set up automated backups

---

## Troubleshooting

### Issue: Server won't start

**Check logs:**
```bash
pm2 logs gauss-hud
# or
sudo journalctl -u gauss-hud -n 50
```

**Common causes:**
- Missing environment variables
- Database connection failure
- Port already in use
- Permission issues

### Issue: Database connection timeout

**Verify connection:**
```bash
mysql -u gauss_user -p -h db.yourproject.com gauss_hud_prod
```

**Check firewall:**
```bash
sudo ufw status
```

### Issue: SSL certificate errors

**Renew certificate:**
```bash
sudo certbot renew --dry-run
sudo certbot renew
sudo systemctl reload nginx
```

### Issue: 502 Bad Gateway

**Check backend status:**
```bash
pm2 status
# or
sudo systemctl status gauss-hud
```

**Check Nginx proxy configuration:**
```bash
sudo nginx -t
```

---

## Performance Optimization

### 1. Enable Compression

Add to Nginx config:

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css application/json application/javascript;
```

### 2. Database Query Optimization

```sql
-- Add indexes
CREATE INDEX idx_feedback_user_id ON feedback(userId);
CREATE INDEX idx_sessions_user_id ON operatorSessions(userId);
```

### 3. Node.js Performance

```bash
# Use cluster mode with PM2
pm2 start dist/index.js --name gauss-hud -i max
```

---

## Support

For deployment issues:
- Email: jzwnathan@lightbound.uk
- Review logs in `/var/log/gauss-hud/`
- Check [README.md](README.md) for general setup

---

**Generated with [Continue](https://continue.dev)**

Co-Authored-By: Continue <noreply@continue.dev>
