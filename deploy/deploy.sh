#!/bin/bash
# ╔══════════════════════════════════════════════════════════╗
# ║  CDC 科普文章生成平台 — 一键部署脚本 (Linux / macOS)    ║
# ╚══════════════════════════════════════════════════════════╝

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║   CDC 科普文章生成平台 — Docker 一键部署      ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

# ── 1. 检查 Docker ──
if ! command -v docker &> /dev/null; then
    echo "[ERROR] 未检测到 Docker，请先安装 Docker"
    echo "  安装指南：https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "[ERROR] Docker Compose V2 未安装或版本过低"
    echo "  请升级 Docker 至 20.10+ 或单独安装 Docker Compose V2"
    exit 1
fi

echo "[OK] Docker $(docker --version)"
echo "[OK] Docker Compose $(docker compose version --short)"
echo ""

# ── 2. 检查 .env 文件 ──
cd "$SCRIPT_DIR"

if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "[INFO] 未找到 .env 文件，正在从 .env.example 创建..."
        cp .env.example .env
        echo ""
        echo "  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
        echo "  !!  请先编辑 deploy/.env 填入必要配置后再启动  !!"
        echo "  !!  必填项：DASHSCOPE_API_KEY                  !!"
        echo "  !!  建议修改：DB_PASSWORD                      !!"
        echo "  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
        echo ""
        echo "  使用命令编辑："
        echo "    nano deploy/.env"
        echo "    vim deploy/.env"
        echo ""
        exit 1
    else
        echo "[ERROR] 未找到 .env.example，无法创建配置文件"
        exit 1
    fi
fi

# 检查必填项
source .env 2>/dev/null || true
if [ -z "$DASHSCOPE_API_KEY" ] || [ "$DASHSCOPE_API_KEY" = "your-dashscope-api-key-here" ]; then
    echo "[WARN] DASHSCOPE_API_KEY 未配置！"
    echo "  LLM 文本生成、向量嵌入、图片生成功能将无法使用。"
    echo "  如需使用，请编辑 deploy/.env 填入 API Key 后重新运行。"
    echo ""
    read -p "  是否继续启动？(y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# ── 3. 检查数据库初始化文件 ──
if [ -f "$PROJECT_ROOT/db/init.sql" ]; then
    SQL_FILE="init.sql"
elif [ -f "$PROJECT_ROOT/db/init_schema.sql" ]; then
    SQL_FILE="init_schema.sql"
    echo "[INFO] 使用表结构文件 init_schema.sql（仅建表，不含数据）"
else
    echo "[ERROR] 未找到数据库初始化文件"
    echo "  请将 db/init_schema.sql 或 db/init.sql 放到 db/ 目录下"
    exit 1
fi

SQL_SIZE=$(stat -c%s "$PROJECT_ROOT/db/$SQL_FILE" 2>/dev/null || stat -f%z "$PROJECT_ROOT/db/$SQL_FILE" 2>/dev/null)
echo "[OK] 数据库初始化文件就绪 ($(echo "$SQL_SIZE" | awk '{printf "%.1f MB", $1/1048576}'))"
echo ""

# ── 4. 构建并启动 ──
echo "[INFO] 正在构建 Docker 镜像并启动服务..."
echo "  首次构建需要下载依赖，可能需要 5-15 分钟"
echo ""

docker compose up -d --build

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║              服务启动完毕！                    ║"
echo "  ╠═══════════════════════════════════════════════╣"
echo "  ║                                               ║"

# 读取端口配置
NGINX_P=${NGINX_PORT:-80}
BACKEND_P=${BACKEND_PORT:-8080}
AGENT_P=${AGENT_PORT:-8001}
MYSQL_P=${MYSQL_PORT:-3306}

echo "  ║  访问地址：http://localhost:${NGINX_P}              ║"
echo "  ║                                               ║"
echo "  ║  各服务端口（调试用）：                          ║"
echo "  ║    Backend API : http://localhost:${BACKEND_P}       ║"
echo "  ║    Agent API   : http://localhost:${AGENT_P}       ║"
echo "  ║    MySQL       : localhost:${MYSQL_P}               ║"
echo "  ║                                               ║"
echo "  ║  常用命令：                                      ║"
echo "  ║    查看日志：docker compose logs -f             ║"
echo "  ║    停止服务：docker compose down                ║"
echo "  ║    重启服务：docker compose restart             ║"
echo "  ║    清除数据重建：                                ║"
echo "  ║      docker compose down -v                    ║"
echo "  ║      docker compose up -d --build              ║"
echo "  ║                                               ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""
