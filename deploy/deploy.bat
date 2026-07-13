@echo off
chcp 65001 >nul 2>&1
REM ╔══════════════════════════════════════════════════════════╗
REM ║  CDC 科普文章生成平台 — 一键部署脚本 (Windows)          ║
REM ╚══════════════════════════════════════════════════════════╝

setlocal EnableDelayedExpansion

echo.
echo   ============================================
echo     CDC 科普文章生成平台 — Docker 一键部署
echo   ============================================
echo.

REM ── 1. 检查 Docker ──
where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] 未检测到 Docker，请先安装 Docker Desktop
    echo   下载地址：https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

docker compose version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker Compose V2 未安装或版本过低
    echo   请升级 Docker Desktop 至最新版本
    pause
    exit /b 1
)

echo [OK] Docker 已安装
echo.

REM ── 2. 检查 .env 文件 ──
cd /d "%~dp0"

if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] 未找到 .env 文件，正在从 .env.example 创建...
        copy ".env.example" ".env" >nul
        echo.
        echo   !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        echo   !!  请先编辑 deploy\.env 填入必要配置后再启动  !!
        echo   !!  必填项：DASHSCOPE_API_KEY                  !!
        echo   !!  建议修改：DB_PASSWORD                      !!
        echo   !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        echo.
        echo   使用记事本打开：notepad deploy\.env
        echo.
        pause
        exit /b 1
    ) else (
        echo [ERROR] 未找到 .env.example，无法创建配置文件
        pause
        exit /b 1
    )
)

REM ── 3. 检查数据库初始化文件 ──
set "PROJECT_ROOT=%~dp0.."
if exist "%PROJECT_ROOT%\db\init.sql" (
    echo [OK] 使用完整数据库文件 init.sql
) else if exist "%PROJECT_ROOT%\db\init_schema.sql" (
    echo [OK] 使用表结构文件 init_schema.sql（仅建表，不含数据）
) else (
    echo [ERROR] 未找到数据库初始化文件
    echo   请将 db\init_schema.sql 或 db\init.sql 放到 db\ 目录下
    pause
    exit /b 1
)

echo [OK] 数据库初始化文件就绪
echo.

REM ── 4. 构建并启动 ──
echo [INFO] 正在构建 Docker 镜像并启动服务...
echo   首次构建需要下载依赖，可能需要 5-15 分钟
echo.

docker compose up -d --build

echo.
echo   ============================================
echo              服务启动完毕！
echo   ============================================
echo.
REM ── 读取端口配置 ──
set "NGINX_PORT=80"
set "BACKEND_PORT=8080"
set "AGENT_PORT=8001"
set "MYSQL_PORT=3306"
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    if "%%a"=="NGINX_PORT" set "NGINX_PORT=%%b"
    if "%%a"=="BACKEND_PORT" set "BACKEND_PORT=%%b"
    if "%%a"=="AGENT_PORT" set "AGENT_PORT=%%b"
    if "%%a"=="MYSQL_PORT" set "MYSQL_PORT=%%b"
)

echo   访问地址：http://localhost:!NGINX_PORT!
echo.
echo   各服务端口（调试用）：
echo     Backend API : http://localhost:!BACKEND_PORT!
echo     Agent API   : http://localhost:!AGENT_PORT!
echo     MySQL       : localhost:!MYSQL_PORT!
echo.
echo   常用命令：
echo     查看日志：docker compose logs -f
echo     停止服务：docker compose down
echo     重启服务：docker compose restart
echo     清除数据重建：
echo       docker compose down -v
echo       docker compose up -d --build
echo.
echo   ============================================
echo.

pause
