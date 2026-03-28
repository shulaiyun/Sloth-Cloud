#!/bin/sh
set -e

mkdir -p \
  /var/www/html/storage/framework/cache/data \
  /var/www/html/storage/framework/sessions \
  /var/www/html/storage/framework/views \
  /var/www/html/storage/logs \
  /var/www/html/bootstrap/cache \
  /var/www/html/public/build \
  /var/www/html/public/default

if [ -d /var/www/html/public/default ] && [ ! -f /var/www/html/public/build/manifest.json ]; then
  cp -R /var/www/html/public/default/. /var/www/html/public/build/
fi

if [ -d /var/www/html/public/build ] && [ ! -f /var/www/html/public/default/manifest.json ]; then
  cp -R /var/www/html/public/build/. /var/www/html/public/default/
fi

chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache
chmod -R ug+rwX /var/www/html/storage /var/www/html/bootstrap/cache

php /var/www/html/artisan storage:link >/dev/null 2>&1 || true

attempt=1
max_attempts=40
while [ "$attempt" -le "$max_attempts" ]; do
  if php /var/www/html/artisan migrate --force && php /var/www/html/artisan app:ensure-defaults; then
    break
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "Sloth Cloud: migration/default setup failed after ${max_attempts} attempts."
    break
  fi

  echo "Sloth Cloud: waiting for database (${attempt}/${max_attempts})..."
  attempt=$((attempt + 1))
  sleep 3
done

php /var/www/html/artisan app:localization:sync >/dev/null 2>&1 || true
php /var/www/html/artisan filament:assets >/dev/null 2>&1 || true

php /var/www/html/artisan config:clear >/dev/null 2>&1 || true
php /var/www/html/artisan route:clear >/dev/null 2>&1 || true
php /var/www/html/artisan view:clear >/dev/null 2>&1 || true

if [ ! -f /var/www/html/public/default/manifest.json ] && [ ! -f /var/www/html/public/build/manifest.json ]; then
  echo "Sloth Cloud: Vite manifest missing after startup."
  find /var/www/html/public -maxdepth 3 -type f | sort || true
fi

exec "$@"
