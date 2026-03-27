#!/bin/sh
set -e

mkdir -p \
  /var/www/html/storage/framework/cache/data \
  /var/www/html/storage/framework/sessions \
  /var/www/html/storage/framework/views \
  /var/www/html/storage/logs \
  /var/www/html/bootstrap/cache

chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache
chmod -R ug+rwX /var/www/html/storage /var/www/html/bootstrap/cache

php /var/www/html/artisan storage:link >/dev/null 2>&1 || true
php /var/www/html/artisan config:clear >/dev/null 2>&1 || true
php /var/www/html/artisan route:clear >/dev/null 2>&1 || true
php /var/www/html/artisan view:clear >/dev/null 2>&1 || true

exec "$@"
