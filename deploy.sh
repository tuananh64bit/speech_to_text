#!/bin/bash
# ============================================================
# VoiceScribe - Deploy Script
# Chạy lệnh này trên máy LOCAL để deploy lên VPS
# 
# Cách dùng:
#   chmod +x deploy.sh
#   ./deploy.sh
# ============================================================

set -e  # Dừng ngay nếu có lỗi

# ─── CẤU HÌNH (sửa các giá trị này trước khi chạy) ────────
VPS_IP="YOUR_VPS_IP"          # VD: 192.168.1.100
VPS_USER="root"               # hoặc ubuntu, debian...
VPS_PATH="/var/www/voicescribe"
DOMAIN="your-domain.com"      # hoặc để trống nếu dùng IP
# ───────────────────────────────────────────────────────────

echo "🔨 1. Building production bundle..."
npm run build

echo "📦 2. Uploading dist/ to VPS..."
ssh "$VPS_USER@$VPS_IP" "mkdir -p $VPS_PATH"
rsync -avz --delete dist/ "$VPS_USER@$VPS_IP:$VPS_PATH/"

echo "⚙️  3. Configuring Nginx on VPS..."
ssh "$VPS_USER@$VPS_IP" bash << EOF
  # Install Nginx if not present
  if ! command -v nginx &> /dev/null; then
    apt-get update -qq && apt-get install -y nginx
  fi

  # Write Nginx config
  cat > /etc/nginx/sites-available/voicescribe << 'NGINX'
server {
    listen 80;
    server_name ${DOMAIN:-_};

    root $VPS_PATH;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain application/javascript text/css application/json;

    # Cache static assets aggressively
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA routing - always serve index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
}
NGINX

  # Enable site
  ln -sf /etc/nginx/sites-available/voicescribe /etc/nginx/sites-enabled/voicescribe
  rm -f /etc/nginx/sites-enabled/default

  # Test & reload Nginx
  nginx -t && systemctl reload nginx
  
  echo "✅ Nginx configured!"
EOF

echo ""
echo "✅ Deploy complete!"
echo "🌐 Your app is live at: http://$VPS_IP"
if [ -n "$DOMAIN" ]; then
  echo "   Or: http://$DOMAIN (after pointing DNS)"
fi
echo ""
echo "💡 Next: Add HTTPS with: certbot --nginx -d $DOMAIN"
