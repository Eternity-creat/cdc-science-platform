# v1.1.0 服务器更新部署指南

本文档描述如何将 CDC 科普文章生成平台从 v1.0.0 升级到 v1.1.0。

## 更新概述

v1.1.0 是一个纯代码修复版本，不涉及数据库表结构变更。改动涉及三个服务：

- **Backend（Java Spring Boot）**：11 项后端 bug 修复 + 1 个全局异常处理器
- **Agent（Python FastAPI）**：parse-intent 接口参数绑定方式变更
- **Frontend（React）**：5 项前端交互优化（toast 提示、表单校验、智能解析）

MySQL 和 Nginx 服务无需重新构建。

## 前置检查

在开始之前，确认以下条件：

1. 服务器上已部署 v1.0.0 且各服务正常运行
2. v1.1.0 的代码已推送到服务器（git pull 或手动上传）
3. Docker 和 Docker Compose V2 可用

```bash
docker --version        # 需 20.10+
docker compose version  # 需 V2
```

## 部署步骤

### 1. 拉取最新代码

进入项目根目录，拉取 v1.1.0 代码：

```bash
cd /path/to/cdc-agent-project/cdc
git pull origin main
```

如果不是 git 管理，将修改过的文件手动上传覆盖到对应目录。涉及的变更文件清单见文末附录。

### 2. 重建受影响的服务

因为 MySQL 和 Nginx 没有变化，只需重建 backend、agent、frontend 三个服务：

```bash
cd deploy

# 方式一：一次性重建三个服务（推荐）
docker compose up -d --build backend agent frontend

# 方式二：逐个重建（如果需要分步验证）
docker compose up -d --build backend
docker compose up -d --build agent
docker compose up -d --build frontend
```

`--build` 参数会强制重新构建镜像，确保使用最新代码。`-d` 保持后台运行。

Docker Compose 会自动处理服务依赖关系：backend 依赖 mysql 健康检查通过后启动，agent 依赖 backend 健康检查通过后启动。

### 3. 确认服务状态

```bash
# 查看所有容器状态
docker compose ps

# 确认所有服务为 healthy / running
```

预期输出：

| 服务 | 状态 | 端口 |
|------|------|------|
| cdc-mysql | healthy | 3306 |
| cdc-backend | healthy | 8080 |
| cdc-agent | healthy | 8001 |
| cdc-frontend | running | 80（内部） |
| cdc-nginx | running | 80 |

### 4. 验证关键修复

```bash
# 验证 Backend 正常响应
curl http://localhost:8080/api/article/list?page=1&size=10

# 验证全局异常处理器（请求不存在的文章，应返回 Result 格式而非 Spring 默认错误）
curl http://localhost:8080/api/article/99999
# 预期：{"code":500,"msg":"文章不存在: id=99999","data":null}

# 验证 Agent 健康检查
curl http://localhost:8001/health

# 验证 parse-intent 接口（必须用 JSON body，不再是 query string）
curl -X POST http://localhost:8001/api/agent/parse-intent \
  -H "Content-Type: application/json" \
  -d '{"user_text": "写一篇关于流感预防的科普文章"}'
# 预期：正常进入 LLM 调用流程（不再返回 422）

# 验证前端可访问
curl -s -o /dev/null -w "%{http_code}" http://localhost
# 预期：200
```

### 5. 查看构建日志（可选）

如果某个服务启动异常，查看对应日志：

```bash
# 查看全部日志
docker compose logs -f

# 查看单个服务日志
docker compose logs -f backend
docker compose logs -f agent
docker compose logs -f frontend
```

## 回滚方案

如果 v1.1.0 出现问题需要回滚：

```bash
# 1. 回退代码到 v1.0.0
git checkout v1.0.0  # 或对应的 tag/commit

# 2. 重新构建受影响的三个服务
cd deploy
docker compose up -d --build backend agent frontend

# 3. 验证回滚结果
docker compose ps
```

由于 v1.1.0 没有数据库变更，回滚不需要任何数据库操作。

## 附录：v1.1.0 变更文件清单

以下是本次更新涉及的所有文件，手动部署时按此清单上传覆盖。

### Backend（cdc-backend/）

```
src/main/java/com/cdc/cdcbackend/common/GlobalExceptionHandler.java   ← 新增
src/main/java/com/cdc/cdcbackend/entity/WikiRule.java
src/main/java/com/cdc/cdcbackend/controller/ArticleController.java
src/main/java/com/cdc/cdcbackend/service/impl/ArticleServiceImpl.java
src/main/java/com/cdc/cdcbackend/service/impl/ArticleImageServiceImpl.java
src/main/java/com/cdc/cdcbackend/agent/AgentClient.java
src/main/java/com/cdc/cdcbackend/mapper/CdcArticleModificationMapper.java
src/main/java/com/cdc/cdcbackend/mapper/CdcArticleRequestMapper.java
src/main/resources/mapper/CdcArticleModificationMapper.xml
src/main/resources/mapper/CdcArticleRequestMapper.xml
```

### Agent（cdc-agent/）

```
app/api/agent.py
```

### Frontend（cdc-frontend/）

```
src/pages/Workbench.jsx
src/pages/ArticleCreate.jsx
src/pages/ArticleList.jsx
src/api/article.js
```

### 文档

```
CHANGELOG.md
docs/API.md
docs/DATA_FLOW.md
docs/DEPLOYMENT.md  ← 本文件
```
