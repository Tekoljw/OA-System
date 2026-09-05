# Multi-stage build for OA System
# Stage 1: Build frontend with Node
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source code
COPY src ./src
COPY public ./public
COPY vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json index.html ./
# postcss/tailwind 配置必须一起复制，否则 Vite 不会处理 @tailwind 指令，
# 产物中将不含任何工具类，页面完全失去样式
COPY postcss.config.js tailwind.config.ts ./

# Build frontend
RUN npm run build

# 构建产物必须包含 Tailwind 工具类，否则视为构建失败
RUN grep -q '@tailwind' dist/assets/*.css \
    && echo "ERROR: Tailwind 指令未被处理，检查 postcss.config.js 是否存在" && exit 1 \
    || echo "OK: Tailwind 构建正常"

# Stage 2: Build PHP runtime
FROM php:8.2-fpm-bullseye


# Install system dependencies
RUN apt-get update && apt-get install -y \
    nginx \
    supervisor \
    curl \
    git \
    zip \
    unzip \
    default-mysql-client \
    postgresql-client \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install PHP extensions
RUN docker-php-ext-install pdo pdo_mysql pdo_pgsql opcache

# Copy compiled frontend from builder
COPY --from=frontend-builder /build/dist /var/www/oa-system/public/dist

# Copy backend files
COPY api /var/www/oa-system/api
COPY src /var/www/oa-system/src

# Set working directory
WORKDIR /var/www/oa-system

# Configure PHP
RUN echo "opcache.enable=1" >> /usr/local/etc/php/conf.d/opcache.ini
RUN echo "opcache.memory_consumption=256" >> /usr/local/etc/php/conf.d/opcache.ini

# Configure Nginx - remove default site to avoid conflict
RUN rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-available/default
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Configure Supervisor
RUN mkdir -p /var/log/supervisor
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Create necessary directories
RUN mkdir -p /var/log/nginx /var/log/php-fpm
RUN chown -R www-data:www-data /var/www/oa-system

# Expose ports
# 时区：使用者在 UTC+8。基础镜像默认 UTC，PHP 的 date() 会比库里的 now() 早 8 小时。
# PHP 不读 TZ 环境变量，必须写 php.ini；tzdata 则决定容器内 date 命令与日志时间。
#
# 刻意放在 apt 层之后：放在前面会让后续所有层的缓存失效，而 bullseye-security
# 已经下架了 Dockerfile 里钉住的 nginx 版本，一旦重跑 apt 就 404 构建失败。
# 时区配置放最后同样生效，且不动已经能正常构建的依赖层。
ENV TZ=Asia/Singapore
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && printf 'date.timezone = %s\n' "$TZ" > /usr/local/etc/php/conf.d/timezone.ini

EXPOSE 80 9000

# Start services via Supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
