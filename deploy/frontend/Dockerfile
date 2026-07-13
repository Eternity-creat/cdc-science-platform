# ╔══════════════════════════════════════════════════════════╗
# ║  CDC Frontend — React + Vite → Nginx 静态             ║
# ║  多阶段构建：Node 编译 → Nginx 托管                    ║
# ╚══════════════════════════════════════════════════════════╝

# ── 第一阶段：Node 构建 ──
FROM node:20-alpine AS builder

WORKDIR /build

# 先复制依赖文件，利用 Docker 缓存
COPY package.json package-lock.json ./
RUN npm ci

# 复制源码并构建
COPY . .
RUN npm run build

# ── 第二阶段：Nginx 静态托管 ──
FROM nginx:alpine

LABEL maintainer="CDC Platform"
LABEL description="CDC 科普文章生成平台 — React Frontend"

# 清除默认配置
RUN rm -rf /usr/share/nginx/html/*

# 复制构建产物
COPY --from=builder /build/dist /usr/share/nginx/html

# 前端 Nginx 配置（SPA history fallback）
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
