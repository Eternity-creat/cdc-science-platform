# ╔══════════════════════════════════════════════════════════╗
# ║  CDC Agent — Python 3.11 + FastAPI + LangGraph         ║
# ║  单阶段构建（Python 无需多阶段）                        ║
# ╚══════════════════════════════════════════════════════════╝

FROM python:3.11-slim

LABEL maintainer="CDC Platform"
LABEL description="CDC 科普文章生成平台 — Python Agent"

WORKDIR /app

# 替换 Debian 源为阿里云镜像（国内服务器加速）
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null || true

# 系统依赖（gcc 编译某些 Python 包需要）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# 配置 pip 阿里云镜像
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ && \
    pip config set global.trusted-host mirrors.aliyun.com

# 先复制依赖文件，利用 Docker 缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY app ./app

# 创建上传目录（运行时会被 volume 覆盖）
RUN mkdir -p /app/uploads/images

EXPOSE 8001

# uvicorn 启动
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8001", \
     "--workers", "1", \
     "--log-level", "info"]
