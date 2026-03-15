# Production Installation Guide (No Repository Clone)

This guide shows you how to deploy OVPN Platform in production without cloning the repository. All you need is Docker and a few configuration files.

## 📋 Prerequisites

- Docker Engine 20.10+ installed
- Docker Compose v2.0+ installed
- Linux server (Ubuntu 20.04+, Debian 11+, CentOS 8+, etc.)
- Root or sudo access
- Open ports: 3000 (Web UI), 3001 (API)

---

## 🚀 Quick Installation

### Method 1: One-Line Install Script

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/ovpn-platform/main/scripts/install-prod.sh | sudo bash
```

This script will:
1. Download required files
2. Generate secure secrets
3. Configure environment
4. Start services

### Method 2: Manual Installation

Follow the steps below for full control over the installation process.

---

## 📥 Step 1: Download Configuration Files

Create a directory for OVPN Platform:

```bash
mkdir -p /opt/ovpn-platform
cd /opt/ovpn-platform
```

Download the production compose file:

```bash
wget https://raw.githubusercontent.com/adityadarma/ovpn-platform/main/docker-compose.yml
```

Download the environment template:

```bash
wget https://raw.githubusercontent.com/adityadarma/ovpn-platform/main/.env.production -O .env
```

---

## 🔐 Step 2: Configure Environment Variables

Edit the `.env` file:

```bash
nano .env
```

### Required Configuration

**1. Generate JWT Secret (Required):**

```bash
# Generate a secure random string
openssl rand -base64 32
```

Copy the output and set it in `.env`:
```env
JWT_SECRET=your_generated_secret_here
```

**2. Choose Database Type:**

For SQLite (simplest, default):
```env
DATABASE_TYPE=sqlite
# No additional configuration needed
```

For PostgreSQL (recommended for production):
```env
DATABASE_TYPE=postgres
DATABASE_URL=postgresql://ovpn:YOUR_PASSWORD@postgres:5432/ovpn
POSTGRES_USER=ovpn
POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD
POSTGRES_DB=ovpn
```

For MySQL/MariaDB:
```env
DATABASE_TYPE=mysql
DATABASE_URL=mysql://ovpn:YOUR_PASSWORD@mariadb:3306/ovpn
MYSQL_USER=ovpn
MYSQL_PASSWORD=YOUR_SECURE_PASSWORD
MYSQL_DATABASE=ovpn
MYSQL_ROOT_PASSWORD=YOUR_ROOT_PASSWORD
```

**3. Set API URL:**

```env
# Use your server's public IP or domain
NEXT_PUBLIC_API_URL=http://your-server-ip:3001
# Or with domain:
# NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

---

## 🎯 Step 3: Start Services

### Option A: SQLite (Default - Simplest)

```bash
docker compose up -d
```

### Option B: PostgreSQL (Recommended)

```bash
docker compose --profile postgres up -d
```

### Option C: MySQL/MariaDB

```bash
docker compose --profile mysql up -d
```

---

## ✅ Step 4: Verify Installation

Check if services are running:

```bash
docker compose ps
```

Expected output:
```
NAME            IMAGE                                    STATUS
ovpn-api        ghcr.io/adityadarma/ovpn-platform:api    Up (healthy)
ovpn-web        ghcr.io/adityadarma/ovpn-platform:web    Up
```

Check logs:

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
```

Test API health:

```bash
curl http://localhost:3001/api/v1/health
```

Expected response:
```json
{"status":"ok","timestamp":"2026-03-15T..."}
```

---

## 🌐 Step 5: Access the Platform

Open your browser and navigate to:

```
http://your-server-ip:3000
```

**Default Login Credentials:**
- Username: `admin`
- Password: `Admin@1234!`

⚠️ **IMPORTANT:** Change the default password immediately after first login!

---

## 🔒 Step 6: Secure Your Installation (Recommended)

### 1. Set Up SSL/TLS with Nginx

Install Nginx:

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx -y
```

Create Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/ovpn
```

Add this configuration:

```nginx
# API Backend
upstream ovpn_api {
    server localhost:3001;
}

# Web Frontend
upstream ovpn_web {
    server localhost:3000;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name yourdomain.com api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# Web UI
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://ovpn_web;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# API
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://ovpn_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/ovpn /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Get SSL certificate:

```bash
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

Update `.env`:

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

Restart services:

```bash
docker compose restart
```

### 2. Configure Firewall

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS (for Nginx)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Block direct access to Docker ports (optional)
# sudo ufw deny 3000/tcp
# sudo ufw deny 3001/tcp

# Enable firewall
sudo ufw enable
```

### 3. Set Up Automatic Backups

Create backup script:

```bash
sudo nano /opt/ovpn-platform/backup.sh
```

Add this content:

```bash
#!/bin/bash
BACKUP_DIR="/opt/ovpn-backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup SQLite database
if [ "$DATABASE_TYPE" = "sqlite" ]; then
    docker run --rm \
        -v ovpn_api_data:/data \
        -v $BACKUP_DIR:/backup \
        alpine tar czf /backup/ovpn-sqlite-$DATE.tar.gz /data
fi

# Backup PostgreSQL
if [ "$DATABASE_TYPE" = "postgres" ]; then
    docker compose -f /opt/ovpn-platform/docker-compose.yml \
        exec -T postgres pg_dump -U ovpn ovpn > $BACKUP_DIR/ovpn-postgres-$DATE.sql
fi

# Backup MySQL
if [ "$DATABASE_TYPE" = "mysql" ]; then
    docker compose -f /opt/ovpn-platform/docker-compose.yml \
        exec -T mariadb mysqldump -u ovpn -p$MYSQL_PASSWORD ovpn > $BACKUP_DIR/ovpn-mysql-$DATE.sql
fi

# Keep only last 7 days of backups
find $BACKUP_DIR -name "ovpn-*" -mtime +7 -delete

echo "Backup completed: $DATE"
```

Make it executable:

```bash
sudo chmod +x /opt/ovpn-platform/backup.sh
```

Add to crontab (daily at 2 AM):

```bash
sudo crontab -e
```

Add this line:

```
0 2 * * * /opt/ovpn-platform/backup.sh >> /var/log/ovpn-backup.log 2>&1
```

---

## 🔄 Updating the Platform

### Pull Latest Images

```bash
cd /opt/ovpn-platform
docker compose pull
```

### Restart Services

```bash
docker compose up -d
```

### Check for Issues

```bash
docker compose logs -f
```

---

## 🛠️ Common Management Tasks

### View Logs

```bash
# All services
docker compose logs -f

# Last 100 lines
docker compose logs --tail=100

# Specific service
docker compose logs -f api
```

### Restart Services

```bash
# All services
docker compose restart

# Specific service
docker compose restart api
```

### Stop Services

```bash
docker compose down
```

### Check Service Status

```bash
docker compose ps
```

### Access Container Shell

```bash
# API container
docker compose exec api sh

# Web container
docker compose exec web sh
```

### View Resource Usage

```bash
docker stats
```

---

## 🚨 Troubleshooting

### Services Won't Start

Check logs:
```bash
docker compose logs
```

Verify environment variables:
```bash
docker compose config
```

### Cannot Pull Images

If using private registry, login first:
```bash
docker login ghcr.io
# Or for Docker Hub:
docker login
```

### Database Connection Issues

Check database health:
```bash
docker compose ps
```

Test database connection:
```bash
# PostgreSQL
docker compose exec postgres psql -U ovpn -d ovpn -c "SELECT 1;"

# MySQL
docker compose exec mariadb mysql -u ovpn -p -e "SELECT 1;"
```

### Port Already in Use

Check what's using the port:
```bash
sudo netstat -tulpn | grep -E '3000|3001'
```

Change ports in `.env`:
```env
API_PORT=3011
WEB_PORT=3010
```

### Out of Disk Space

Check disk usage:
```bash
docker system df
```

Clean up unused resources:
```bash
docker system prune -a
```

---

## 📊 Monitoring

### Health Check Endpoints

```bash
# API Health
curl http://localhost:3001/api/v1/health

# Check all container health
docker compose ps
```

### Set Up Monitoring (Optional)

Install monitoring tools like:
- **Prometheus + Grafana** for metrics
- **Loki** for log aggregation
- **Uptime Kuma** for uptime monitoring

---

## 🔐 Security Checklist

- [ ] Changed default admin password
- [ ] Generated secure JWT_SECRET
- [ ] Using strong database passwords
- [ ] Configured SSL/TLS (HTTPS)
- [ ] Firewall configured properly
- [ ] Regular backups scheduled
- [ ] Docker images kept up to date
- [ ] Monitoring and alerting set up
- [ ] Access logs reviewed regularly
- [ ] Non-root user for Docker (if possible)

---

## 🗑️ Uninstallation

If you need to remove OVPN Platform:

### Quick Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/ovpn-platform/main/scripts/uninstall-prod.sh | sudo bash
```

### Manual Uninstall

```bash
# Stop services
cd /opt/ovpn-platform
docker compose down

# Remove volumes (WARNING: This deletes all data!)
docker volume rm ovpn_api_data ovpn_postgres_data ovpn_mariadb_data

# Remove images
docker rmi $(docker images | grep ovpn-platform | awk '{print $3}')

# Remove installation directory
sudo rm -rf /opt/ovpn-platform

# Remove backups (optional)
sudo rm -rf /opt/ovpn-backups

# Remove cron jobs (if configured)
sudo crontab -e  # Remove OVPN-related lines

# Remove Nginx config (if configured)
sudo rm /etc/nginx/sites-enabled/ovpn
sudo rm /etc/nginx/sites-available/ovpn
sudo systemctl reload nginx
```

---

## 📚 Additional Resources

- [Full Docker Documentation](DOCKER.md)
- [Main README](README.md)
- [GitHub Repository](https://github.com/adityadarma/ovpn-platform)

---

## 💬 Support

If you encounter issues:

1. Check the [Troubleshooting](#-troubleshooting) section
2. Review logs: `docker compose logs`
3. Open an issue on GitHub
4. Join our community Discord/Slack

---

## 📝 Quick Reference

```bash
# Installation directory
cd /opt/ovpn-platform

# Start services
docker compose up -d

# Stop services
docker compose down

# View logs
docker compose logs -f

# Update platform
docker compose pull
docker compose up -d

# Backup (if script created)
/opt/ovpn-platform/backup.sh

# Access
# Web UI: http://your-server:3000
# API: http://your-server:3001
```
