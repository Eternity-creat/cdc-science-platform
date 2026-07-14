#!/bin/bash
# ╔══════════════════════════════════════════════════════════╗
# ║  CDC CI/CD 智能增量部署脚本                              ║
# ║  由 GitHub Actions 触发，仅重建有变更的服务               ║
# ╚══════════════════════════════════════════════════════════╝

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "===== CDC Deploy: $(date '+%Y-%m-%d %H:%M:%S') ====="

# ── 1. 拉取最新代码 ──
git fetch origin
BEFORE=$(git rev-parse HEAD)
git pull --ff-only origin main
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
    echo "[SKIP] 代码无变更"
    exit 0
fi

echo "[OK] 更新: ${BEFORE:0:7} -> ${AFTER:0:7}"

# ── 2. 检测变更目录 ──
CHANGED_FILES=$(git diff --name-only "$BEFORE" "$AFTER")
echo "[INFO] 变更文件:"
echo "$CHANGED_FILES" | sed 's/^/  /'
echo ""

SERVICES=""
add_service() {
    local svc="$1"
    if [[ " $SERVICES " != *" $svc "* ]]; then
        SERVICES="$SERVICES $svc"
    fi
}

echo "$CHANGED_FILES" | grep -q "^cdc-frontend/" && add_service "frontend" || true
echo "$CHANGED_FILES" | grep -q "^cdc-backend/"  && add_service "backend"  || true
echo "$CHANGED_FILES" | grep -q "^cdc-agent/"    && add_service "agent"    || true
echo "$CHANGED_FILES" | grep -qE "^(deploy/|db/)" && add_service "_all"    || true

# ── 3. 执行部署 ──
if [ "$SERVICES" = "_all" ]; then
    echo "[DEPLOY] 全量构建 (deploy/ 或 db/ 变更)"
    docker compose up -d --build
elif [ -z "$SERVICES" ]; then
    echo "[SKIP] 无服务相关变更，跳过构建"
else
    echo "[DEPLOY] 增量构建服务:${SERVICES}"
    docker compose up -d --build $SERVICES
fi

echo ""
echo "[OK] 部署完成"
