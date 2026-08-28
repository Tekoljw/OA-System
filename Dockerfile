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

# Build frontend
RUN npm run build

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
EXPOSE 80 9000

# Start services via Supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
