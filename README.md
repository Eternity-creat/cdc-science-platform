# CDC 科普文章智能生成平台

基于 RAG（检索增强生成）架构的疾控科普文章智能创作系统。通过医学知识库检索 + 大语言模型生成 + 自动事实核查的三层流水线，将专业疾控知识转化为通俗易懂的科普文章。

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 18 + Vite 6 + TailwindCSS | SPA 单页应用，shadcn/ui 组件体系 |
| 后端 | Spring Boot 4 + Java 21 + MyBatis | RESTful API，业务逻辑与持久化 |
| Agent | FastAPI + LangGraph + DashScope | AI 生成流水线，向量检索，多模型池 |
| 数据库 | MySQL 8.0 | 15 张表，含知识库向量存储 |
| 部署 | Docker Compose + Nginx | 一键部署，反向代理 |

## 系统架构

```
                    ┌─────────────────┐
                    │    Nginx :80    │
                    │   反向代理入口    │
                    └───────┬─────────┘
              ┌─────────────┼─────────────┐
              │             │             │
       ┌──────▼──────┐ ┌───▼────┐ ┌──────▼──────┐
       │   Frontend   │ │Backend │ │   Agent     │
       │  React SPA   │ │ :8080  │ │  FastAPI    │
       │   Nginx :80  │ │ Spring │ │  LangGraph  │
       └──────────────┘ │  Boot  │ │   :8001     │
                        └───┬────┘ └──────┬──────┘
                            │             │
                            ▼             ▼
                    ┌──────────┐  ┌──────────────┐
                    │  MySQL   │  │  DashScope   │
                    │  :3306   │  │  LLM API     │
                    │ 15 张表   │  │  (通义千问)   │
                    └──────────┘  └──────────────┘
```

**三服务分工：**

- **Frontend**（前端）：文章创建向导、工作台编辑、知识库管理、LLM 配置管理
- **Backend**（Java 后端）：文章 CRUD、知识库 CRUD、模板管理、LLM 配置管理、修改历史追踪
- **Agent**（Python Agent）：意图解析、向量检索、大纲生成、正文生成、事实核查、规则校验、反思迭代、图片生成

## 核心功能

- **双模式创建**：表单模式（下拉选择疾病/疫苗 + 人群 + 场景）和自由文本模式
- **AI 大纲生成**：基于知识库检索 + 模板匹配，生成结构化文章大纲
- **AI 正文生成**：融合检索知识、引用标记（`{ref:N}`）、字数控制、规则约束
- **自动事实核查**：逐句比对权威知识片段，不合格则自动反思修正（最多 3 轮）
- **知识库管理**：疾病/疫苗/人群/场景四大实体，含知识片段、生成规则、实体关系
- **LLM 多模型池**：前端可视化管理模型配置（文本生成 / 向量嵌入 / 图片生成），运行时动态加载
- **修改历史追溯**：每次 AI 生成和人工编辑均记录变更，支持一键回退
- **配图生成**：分析文章段落，自动识别需要配图的位置并调用多模态 API 生成插图
- **Markdown 导出**：一键导出清理后的 Markdown 文件

## 快速开始（Docker 一键部署）

### 前置要求

- Docker 20.10+ 和 Docker Compose V2
- 一个 DashScope API Key（[申请地址](https://dashscope.console.aliyun.com/)）

### 三步启动

```bash
# 1. 克隆项目
git clone https://github.com/your-username/cdc-science-platform.git
cd cdc-science-platform/deploy

# 2. 配置环境变量
cp .env.example .env
nano .env    # 填入 DASHSCOPE_API_KEY 和数据库密码

# 3. 一键构建并启动
bash deploy.sh    # Linux/macOS
# 或 deploy.bat   # Windows
```

启动后访问 `http://localhost`（或你配置的 `NGINX_PORT`）即可使用。

首次构建需下载 Maven 依赖、Python 包和 npm 包，约 5-15 分钟。后续启动秒级完成。

> **关于数据库：** 仓库中的 `db/init_schema.sql` 仅包含表结构（15 张表），不含业务数据。首次启动时会自动建表。如果你有已有的数据库需要导入，将完整的 SQL 导出文件保存为 `db/init.sql`，部署脚本会优先使用它。

### 环境变量说明

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DASHSCOPE_API_KEY` | 是 | — | 阿里云百炼 API Key |
| `DB_PASSWORD` | 建议改 | `123456` | MySQL root 密码 |
| `LLM_MODEL` | 否 | `qwen-turbo` | 默认文本生成模型 |
| `EMBEDDING_MODEL` | 否 | `text-embedding-v2` | 向量嵌入模型 |
| `NGINX_PORT` | 否 | `80` | Nginx 入口端口 |
| `MYSQL_PORT` | 否 | `3306` | MySQL 端口 |

完整变量列表见 `deploy/.env.example`。

## 本地开发

如果不用 Docker，可以分别启动三个服务：

```bash
# 1. 数据库（需要本地安装 MySQL 8.0）
mysql -u root -p < db/init.sql

# 2. Java 后端（需要 JDK 21 + Maven）
cd cdc-backend
cp .env.example .env   # 配置数据库连接等
./mvnw spring-boot:run

# 3. Python Agent（需要 Python 3.11+）
cd cdc-agent
pip install -r requirements.txt
cp .env.example .env   # 配置 API Key 等
uvicorn app.main:app --host 0.0.0.0 --port 8001

# 4. React 前端（需要 Node 20+）
cd cdc-frontend
npm install
npm run dev            # http://localhost:5173
```

前端 Vite 开发代理会自动将 API 请求分发到后端和 Agent。

## 项目结构

```
cdc-science-platform/
├── README.md                 # 本文件
├── ARCHITECTURE.md           # 系统架构设计文档
├── CONTRIBUTING.md           # 开发者贡献指南
├── CHANGELOG.md              # 版本变更记录
├── LICENSE                   # MIT 开源协议
├── .gitignore
├── docs/
│   ├── API.md                # 完整 API 参考文档
│   └── DATA_FLOW.md          # 数据流转与链路说明
├── cdc-backend/              # Java Spring Boot 后端
│   ├── pom.xml
│   └── src/main/java/com/cdc/cdcbackend/
│       ├── controller/       # 7 个 REST 控制器（60 个端点）
│       ├── service/          # 8 个业务服务
│       ├── mapper/           # 14 个 MyBatis Mapper
│       ├── entity/           # 14 个数据实体
│       ├── dto/              # 8 个数据传输对象
│       └── config/           # 配置类（Agent、DashScope、异步）
├── cdc-agent/                # Python FastAPI + LangGraph Agent
│   ├── requirements.txt
│   └── app/
│       ├── api/              # 6 个 API 端点
│       ├── core/             # LLM 客户端、配置管理、向量嵌入
│       ├── models/           # 请求/响应模型、AgentState
│       ├── prompts/          # 9 个 Prompt 模板
│       ├── skills/           # 12 个 Skill（流程 + 知识库）
│       ├── tools/            # 向量存储、内容格式化
│       └── workflow/         # LangGraph 工作流定义
├── cdc-frontend/             # React 前端
│   ├── package.json
│   └── src/
│       ├── pages/            # 6 个页面组件
│       ├── components/       # UI 组件（16 个基础 + 5 个业务）
│       └── api/              # 6 个 API 客户端模块
├── db/
│   └── init.sql              # 数据库初始化脚本（含种子数据）
└── deploy/                   # Docker 部署配置
    ├── docker-compose.yml    # 5 服务编排
    ├── .env.example          # 环境变量模板
    ├── deploy.sh             # Linux 一键部署脚本
    ├── deploy.bat            # Windows 一键部署脚本
    ├── nginx/default.conf    # Nginx 反向代理配置
    ├── mysql/my.cnf          # MySQL 自定义配置
    ├── backend/Dockerfile    # Java 多阶段构建
    ├── agent/Dockerfile      # Python 构建
    └── frontend/Dockerfile   # React 多阶段构建
```

## 数据库设计

15 张表分为三大模块：

**文章模块：** `cdc_article`（文章主表）、`cdc_article_request`（创建请求）、`cdc_article_modification`（修改历史）、`cdc_article_image`（配图管理）、`cdc_agent_trace`（Agent 执行追踪）、`cdc_agent_feedback`（用户编辑反馈）

**知识库模块：** `wiki_entity`（实体：疾病/疫苗/人群/场景）、`wiki_segment`（知识片段）、`wiki_segment_embedding`（向量持久化）、`wiki_rule`（生成规则）、`wiki_relation`（实体关系）

**配置模块：** `cdc_article_template`（文章模板）、`cdc_llm_config`（LLM 模型配置）、`cdc_embedding_cache`（向量缓存）、`cdc_upload_task`（上传任务）

详细 ER 关系和字段说明见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 常用命令

```bash
# Docker 环境
cd deploy
docker compose ps              # 查看服务状态
docker compose logs -f agent   # 查看 Agent 日志
docker compose restart         # 重启所有服务
docker compose down            # 停止（数据保留）
docker compose down -v         # 停止并清除数据（慎用！）

# 本地开发
cd cdc-frontend && npm run dev          # 前端开发服务器
cd cdc-backend && ./mvnw spring-boot:run # 后端启动
cd cdc-agent && uvicorn app.main:app --reload  # Agent 启动（热重载）
```

## 参与贡献

欢迎参与开发！请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解开发规范和贡献流程。

## 开源协议

本项目基于 [MIT License](./LICENSE) 开源。
