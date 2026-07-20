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

```text
                  ┌────────────────────────────────────────┐
                  │         浏览器 (React SPA)              │
                  │   AppShell + 6 路由 + Radix UI         │
                  └──────────────┬─────────────────────────┘
                                 │  http://localhost:80
                                 ▼
                  ┌────────────────────────────────────────┐
                  │     nginx (cdc-nginx :80)              │
                  │   /api/*  → backend                    │
                  │   /api/agent/* → agent                 │
                  │   /uploads/*  → agent                  │
                  │   /*  → frontend                       │
                  └──────┬──────────┬───────────┬──────────┘
                         │          │           │
       ┌─────────────────┘          │           └──────────────────┐
       ▼                            ▼                              ▼
┌──────────────────┐       ┌──────────────────┐         ┌──────────────────┐
│ cdc-frontend     │       │ cdc-backend      │         │ cdc-agent        │
│ React 18 + Vite  │       │ Spring Boot 4    │         │ FastAPI +        │
│ (Nginx 内嵌)     │       │ Java 21 :8080    │         │ LangGraph :8001  │
└──────────────────┘       └────────┬─────────┘         └────────┬─────────┘
                                   │  MyBatis                  │  OpenAI 兼容
                                   ▼                            ▼
                          ┌──────────────────┐         ┌──────────────────┐
                          │  cdc-mysql :3306 │         │ DashScope (Qwen) │
                          │  cdc_knowledge   │         │  LLM + Embedding │
                          │  15 张表         │         │  + Image         │
                          └──────────────────┘         └──────────────────┘
```

**三服务分工：**

- **Frontend**（React SPA）负责所有用户界面：文章创建向导（双模式：表单 / 自由文本）、工作台编辑（outline/draft/final 三相）、知识库管理（含文件上传导入）、LLM 配置管理（堆叠卡片式编辑）、模板管理。使用 Radix UI + shadcn 风格组件，支持暗色模式。通过 Vite 开发代理或 Nginx 反向代理将 API 请求分发到后端和 Agent。
- **Backend**（Spring Boot 4 / Java 21）是业务逻辑中枢，提供约 60 个 REST 端点。负责文章全生命周期管理（创建、编辑、确认、回退、删除、级联清理）、知识库 CRUD（实体、片段、规则、关系）、模板管理、LLM 配置管理、修改历史追踪和 Agent 执行追踪、Wiki 文档上传与异步 embedding 补算。所有数据持久化通过 MyBatis 操作 MySQL。
- **Agent**（FastAPI + LangGraph）是 AI 生成引擎，提供 8 个端点（`/api/agent/*`）。负责意图解析、向量检索（prefilter + cosine）、写作技法规划、大纲生成与校验、正文生成、三路并行质量检查（事实核查 + 规则校验 + 文风评估）、反思迭代、规则修正、文笔润色、图片生成和图片上传。核心是一个 LangGraph 状态机，编排 23 个节点构成生成流水线，并集成了 6 层渐进式披露的写作知识体系。

更详细的架构图（组件视角、Embedding 生命周期、SSE 时序）见 [docs/ARCHITECTURE_DIAGRAM.md](docs/ARCHITECTURE_DIAGRAM.md)。

## 核心功能

- **双模式创建**：表单模式（下拉选择疾病/疫苗 + 人群 + 场景）和自由文本模式
- **AI 大纲生成**：基于知识库检索 + 模板匹配 + 写作知识体系，生成结构化文章大纲，自动校验结构完整性
- **AI 正文生成**：融合检索知识、引用标记（`{ref:N}`）、字数控制、规则约束，动态注入 6 层写作知识（通用规则 → 类型蓝图 → 受众画像 → 技法卡片）
- **三路并行质量检查**：事实核查、规则校验、文风评估并行执行，统一质量门控路由
- **文笔润色**：自动平滑过渡、消除冗余、统一语气，保留引用标注和事实准确性
- **知识库管理**：疾病/疫苗/人群/场景四大实体，含知识片段、生成规则、实体关系；支持 `json / md / txt / docx / pdf` 五种文件的上传导入（先预览后入库），上传后由 Java 后端**异步**计算 embedding
- **LLM 多模型池**：前端可视化管理模型配置（文本生成 / 向量嵌入 / 图片生成），运行时动态加载，60 秒 TTL 自动生效
- **修改历史追溯**：每次 AI 生成和人工编辑均记录变更，支持一键回退（`autosave_pending` → `manual_edit` 升级模式避免脏记录）
- **配图生成**：分析文章段落，自动识别需要配图的位置并调用多模态 API 生成插图；前端支持段落级插入和对齐调整
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

```text
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
│       ├── controller/       # 7 个 REST 控制器（~60 个端点）
│       ├── service/          # 8 个业务服务（含 Embedding 异步落库）
│       ├── mapper/           # 14 个 MyBatis Mapper
│       ├── entity/           # 14 个数据实体
│       ├── dto/              # 数据传输对象
│       ├── event/            # Spring 事件（SegmentChangedEvent → EmbeddingEventListener）
│       └── config/           # 配置类（Agent、DashScope、Async）
├── cdc-agent/                # Python FastAPI + LangGraph Agent
│   ├── requirements.txt
│   └── app/
│       ├── api/              # 8 个 /api/agent/* 端点 + 顶层 /health
│       ├── core/             # LLM 客户端（流式/重试/信号量）、LLM 池（60s TTL）、Embedding 模型
│       ├── models/           # 请求/响应模型、AgentState
│       ├── prompts/          # 11 个 Prompt 模板（含动态组装函数）
│       ├── skills/           # 17 个节点实现类（流程 + 知识库）+ 6 层写作知识体系
│       │   ├── flow/         # 15 个流程类节点实现
│       │   ├── wiki/         # 2 个知识库类节点实现
│       │   └── writing/      # 6 层写作知识体系（Layer 0-5）
│       ├── tools/            # 向量存储、RAG 双层检索、内容格式化
│       └── workflow/         # LangGraph 工作流定义（outline + draft）
├── cdc-frontend/             # React 前端
│   ├── package.json
│   └── src/
│       ├── pages/            # 6 个页面组件
│       ├── components/       # UI 组件（17 个基础 + 5 个业务）
│       └── api/              # 8 个 API 客户端模块
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

欢迎参与开发！

- 开发规范和贡献流程：[CONTRIBUTING.md](./CONTRIBUTING.md)
- 完整贡献者名单：[CONTRIBUTORS.md](./CONTRIBUTORS.md)

## 开源协议

本项目基于 [MIT License](./LICENSE) 开源。

## 开源协议

本项目基于 [MIT License](./LICENSE) 开源。
