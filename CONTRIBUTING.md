# 贡献指南

感谢你考虑为 CDC 科普文章智能生成平台做出贡献！本文档帮助你快速搭建开发环境并了解项目规范。

## 开发环境

### 系统要求

- JDK 21+
- Python 3.11+
- Node.js 20+
- MySQL 8.0+
- Docker & Docker Compose（可选，用于一键部署测试）

### 本地启动

**1. 数据库**

```bash
# 导入初始化脚本
mysql -u root -p < db/init.sql
```

**2. Java 后端**

```bash
cd cdc-backend
cp .env.example .env
# 编辑 .env，配置数据库连接（默认 root/123456）
./mvnw spring-boot:run
# 启动在 http://localhost:8080
```

**3. Python Agent**

```bash
cd cdc-agent
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# 编辑 .env，填入 DASHSCOPE_API_KEY
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
# 启动在 http://localhost:8001
```

**4. React 前端**

```bash
cd cdc-frontend
npm install
npm run dev
# 启动在 http://localhost:5173
```

访问 `http://localhost:5173` 即可使用，Vite 开发代理会自动分发 API 请求。

## 项目结构约定

```
cdc/
├── cdc-backend/src/main/java/com/cdc/cdcbackend/
│   ├── controller/    # REST 控制器（一个资源一个 Controller）
│   ├── service/       # 业务逻辑接口
│   │   └── impl/      # 业务逻辑实现
│   ├── mapper/        # MyBatis Mapper 接口
│   ├── entity/        # 数据库实体
│   ├── dto/           # 数据传输对象
│   ├── config/        # 配置类
│   └── common/        # 通用工具（Result, PageResult）
├── cdc-agent/app/
│   ├── api/           # FastAPI 路由
│   ├── core/          # 核心模块（LLM、配置、嵌入）
│   ├── skills/        # Skill 实现（17 个）
│   │   ├── flow/      # 流程类 Skill（15 个）
│   │   ├── wiki/      # 知识库类 Skill（2 个）
│   │   └── writing/   # 写作知识体系（6 层：索引/规则/蓝图/画像/技法/质量）
│   ├── prompts/       # Prompt 模板 + 动态组装函数
│   ├── models/        # 数据模型
│   ├── tools/         # 工具类
│   └── workflow/      # LangGraph 工作流
└── cdc-frontend/src/
    ├── pages/         # 页面组件（一个路由一个 Page）
    ├── components/    # 可复用组件
    │   └── ui/        # 基础 UI 组件（shadcn 风格）
    └── api/           # API 客户端模块
```

## 代码规范

### Java 后端

- 类名：大驼峰（`ArticleService`）
- 方法/变量：小驼峰（`generateOutline`）
- Controller 方法返回 `Result<T>`，不要直接返回业务对象
- 新增 Mapper 时同步创建对应的 XML 文件（`src/main/resources/mapper/`）
- Service 层定义接口，impl 包下写实现类

### Python Agent

- 文件名：蛇形命名（`fact_check_skill.py`）
- 类名：大驼峰（`FactCheckSkill`）
- 新增 Skill 必须继承 `BaseSkill`，实现 `name`、`metadata`、`execute` 三个成员
- Skill 的 `execute` 方法不要修改传入的 state，用 `new_state = {**state}` 后返回新 dict
- 生成类 Skill 应优先读取 `state["_dynamic_prompt"]`（由节点层动态组装），回退到固定模板
- Prompt 模板放在 `app/prompts/` 下，动态组装函数（如 `build_fusion_prompt`）也放在同一文件中
- 写作知识文件放在 `app/skills/writing/` 下，按层级组织（blueprints/audiences/techniques/quality）
- 异步函数优先，使用 `async/await`
- `skill_loader.py` 依赖 `PyYAML`，新增 YAML 格式的写作知识文件时需同步更新 `skill_index.yaml`

### React 前端

- 组件文件：大驼峰（`ArticleList.jsx`）
- 使用 TailwindCSS utility classes，避免自定义 CSS
- 基础 UI 组件放 `components/ui/`，业务组件放 `components/`
- API 调用统一走 `src/api/` 下的模块，不要在组件中直接 fetch

## 如何新增一个 API 端点

以新增一个「文章收藏」功能为例：

**1. 数据库** — 新增表或字段，编写增量 SQL 脚本放到 `db/` 目录

**2. Entity** — 如需新表，创建 `CdcArticleFavorite.java`

**3. Mapper** — 创建 `CdcArticleFavoriteMapper.java` 和对应 XML

**4. Service** — 创建接口和 impl

**5. Controller** — 在现有 Controller 中新增端点，或创建新的 Controller

**6. 前端** — 在 `src/api/article.js` 中新增调用方法，在页面组件中使用

## 如何新增一个 Skill

以新增一个「情感分析 Skill」为例：

**1. 创建 Skill 文件** `app/skills/flow/sentiment_skill.py`：

```python
from app.skills.base import BaseSkill

class SentimentAnalyzeSkill(BaseSkill):
    @property
    def name(self):
        return "sentiment_analyze"

    @property
    def metadata(self):
        return {
            "description": "分析文章情感倾向",
            "input_fields": ["initial_draft"],
            "output_fields": ["sentiment_score", "sentiment_label"],
            "category": "validation",
            "llm_config_type": "text_generation"
        }

    async def execute(self, state):
        new_state = {**state}
        draft = state.get("initial_draft", "")
        # 调用 LLM 分析 情感
        llm = self.get_llm()
        result = await llm.chat([...])
        new_state["sentiment_score"] = 0.8
        new_state["sentiment_label"] = "positive"
        return new_state
```

**2. 注册** — 在 `app/skills/registry.py` 的 `_init_skills` 方法中添加注册

**3. 添加节点** — 在 `app/workflow/nodes.py` 中添加节点函数

**4. 接入工作流** — 在 `app/workflow/graph.py` 中将节点加入图定义

**5. 编写 Prompt** — 如需 LLM 调用，在 `app/prompts/` 下创建模板

## Git 工作流

### 分支策略

- `main` — 稳定版本，只接受 PR 合入
- `dev` — 开发分支，日常开发在此进行
- `feature/xxx` — 功能分支，从 dev 拉出，完成后 PR 回 dev
- `fix/xxx` — 修复分支，用于紧急修复

### Commit 格式

```
<type>(<scope>): <description>

type: feat | fix | docs | refactor | test | chore
scope: backend | agent | frontend | deploy | db
```

示例：
- `feat(agent): 新增情感分析 Skill`
- `fix(frontend): 修复大纲树折叠状态丢失`
- `docs: 更新 API 文档中的配图管理接口`

### PR 流程

1. 从 `dev` 创建 `feature/xxx` 分支
2. 开发完成后推送到远程
3. 创建 PR 到 `dev`，填写变更说明
4. 通过 review 后合入
5. 定期从 `dev` 合入 `main` 并发布版本

## 提交 Issue

- **Bug Report**：使用 Bug Report 模板，提供复现步骤、环境信息、期望/实际行为
- **Feature Request**：使用 Feature Request 模板，描述使用场景和建议方案

## 问题讨论

如有架构设计或技术方案方面的疑问，建议先在 Issue 中提出讨论，达成共识后再动手实现。
