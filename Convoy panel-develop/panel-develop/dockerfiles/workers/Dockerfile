FROM php:8.2-fpm-alpine

ARG APP_ENV

RUN ALPINE_MINOR="$(cut -d. -f1,2 /etc/alpine-release)" \
    && printf '%s\n' \
        "https://mirrors.tuna.tsinghua.edu.cn/alpine/v${ALPINE_MINOR}/main" \
        "https://mirrors.tuna.tsinghua.edu.cn/alpine/v${ALPINE_MINOR}/community" \
        > /etc/apk/repositories \
    && apk update \
    && apk add --no-cache \
        $PHPIZE_DEPS \
    && pecl channel-update pecl.php.net \
    && pecl install redis-6.2.0 \
    && docker-php-ext-enable redis \
    && docker-php-ext-install -j"$(nproc)" pdo_mysql pcntl opcache \
    && apk del --no-network $PHPIZE_DEPS
RUN echo "opcache.enable_cli=1" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache.ini
RUN if [ $APP_ENV = "local" ]; then \
                echo "opcache.validate_timestamps=1" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache-cli.ini; \
        fi;

RUN apk add --no-cache bash logrotate supervisor

COPY supervisord.conf /etc/supervisord.conf
COPY laravel-logrotate /etc/logrotate.d/laravel

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
