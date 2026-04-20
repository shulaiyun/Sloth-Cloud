FROM php:8.2-fpm-alpine

ARG PHP_XDEBUG
ARG PHP_XDEBUG_MODE='debug'
ARG APP_ENV
ENV PHP_IDE_CONFIG="serverName=convoy"
ENV PHP_MAX_CHILDREN=100

RUN ALPINE_MINOR="$(cut -d. -f1,2 /etc/alpine-release)" \
    && printf '%s\n' \
        "https://mirrors.tuna.tsinghua.edu.cn/alpine/v${ALPINE_MINOR}/main" \
        "https://mirrors.tuna.tsinghua.edu.cn/alpine/v${ALPINE_MINOR}/community" \
        > /etc/apk/repositories \
    && apk update \
    && apk add --no-cache \
        $PHPIZE_DEPS \
        gmp-dev \
    && pecl channel-update pecl.php.net \
    && pecl install redis-6.2.0 \
    && docker-php-ext-enable redis \
    && docker-php-ext-install -j"$(nproc)" pdo_mysql pcntl gmp opcache \
    && apk del --no-network $PHPIZE_DEPS

RUN if [ $APP_ENV = "local" ]; then \
                echo "opcache.validate_timestamps=1" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache-cli.ini; \
        fi;

RUN if [ $PHP_XDEBUG = "true" ]; then \
            apk add --no-cache $PHPIZE_DEPS \
            && pecl install xdebug \
            && docker-php-ext-enable xdebug \
            && apk del --no-network $PHPIZE_DEPS; \
            echo "xdebug.client_host=host.docker.internal" >> /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini; \
            echo "xdebug.mode=$PHP_XDEBUG_MODE" >> /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini; \
            echo "xdebug.idekey=convoy" >> /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini; \
            echo "xdebug.start_with_request=yes" >> /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini; \
        fi;

RUN echo "pm.max_children = $PHP_MAX_CHILDREN" >> /usr/local/etc/php-fpm.d/zz-docker.conf

WORKDIR /var/www

CMD ["php-fpm"]
