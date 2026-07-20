# 文档索引

最后更新：2026-07-19

本文档是 `docs/` 目录的总入口，按主题组织所有项目文档。每份文档都对应一个明确的使用场景，按需查阅即可。

## 入门

| 文档 | 说明 | 何时看 |
|---|---|---|
| [../README.md](../README.md) | 项目总览、技术栈、快速开始（Docker 一键部署 / 本地开发） | 第一次接触项目 |
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | 整体架构、LangGraph 工作流、节点体系、数据库 ER 图、关键技术决策 | 理解系统设计 |
| [ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md) | 基于实际代码绘制的 ASCII 架构图（容器视角 / 后端组件视角 / Agent 组件视角 / Embedding 生命周期 / SSE 时序 / 状态机） | 画图、改架构、做 Code Review 时对照 |

## 团队与贡献

| 文档 | 说明 | 何时看 |
|---|---|---|
| [../CONTRIBUTORS.md](../CONTRIBUTORS.md) | 完整贡献者名单（核心团队 / 协作贡献者 / 外部开源） | 了解谁参与了这个项目 |

## API 参考

| 文档 | 说明 | 何时看 |
|---|---|---|
| [API.md](API.md) | 全部 REST 端点（Java 后端 ~60 + Agent 8）的契约、请求/响应、SSE 事件格式 | 对接前端、写客户端、写测试 |
| [API_FRONTEND_TEAM.md](API_FRONTEND_TEAM.md) | 给前端团队看的 API 速查（与 `API.md` 内容基本一致，独立分发用） | 前端开发 |

## 数据流与端到端链路

| 文档 | 说明 | 何时看 |
|---|---|---|
| [DATA_FLOW.md](DATA_FLOW.md) | 以「HPV 疫苗 + 女性 + 接种场景」为例走一遍从创建到确认的完整数据链路 | 想理解请求怎么流过整个系统 |
| [DATA_FLOW_FRONTEND_TEAM.md](DATA_FLOW_FRONTEND_TEAM.md) | `DATA_FLOW.md` 的前端视角精简版 | 前端只想看自己关心的一段 |
| [ARTICLE_FULL_FLOW_API_AUDIT.md](ARTICLE_FULL_FLOW_API_AUDIT.md) | 文章全流程接口审计，列了每一步调哪些 API | 排查接口调用链是否完整 |

## Wiki 知识库

| 文档 | 说明 | 何时看 |
|---|---|---|
| [WIKI_UPLOAD_MODULE_DESIGN.md](WIKI_UPLOAD_MODULE_DESIGN.md) | Wiki 文档上传模块的**当前实现**说明（事件驱动 embedding 异步落库） | 改 Wiki 上传相关代码 |
| [WIKI_UPLOAD_API_USAGE.md](WIKI_UPLOAD_API_USAGE.md) | 上传/预览/确认三个端点的契约和示例 | 调用上传接口 |
| [FRONTEND_BACKEND_WIKI_INTEGRATION_CHECKLIST.md](FRONTEND_BACKEND_WIKI_INTEGRATION_CHECKLIST.md) | Wiki 模块前后端集成检查清单 | 上线前验收 |
| [LOCAL_BACKEND_WIKI_CHECKLIST.md](LOCAL_BACKEND_WIKI_CHECKLIST.md) | 本地后端 Wiki 功能自检清单 | 本地开发完成后自测 |
| [MISSING_INFO_TO_REQUEST.md](MISSING_INFO_TO_REQUEST.md) | Wiki 上传需要用户/上游系统补充的字段清单 | 实现上传时确认入参 |

## RAG 与检索

| 文档 | 说明 | 何时看 |
|---|---|---|
| [RAG_RETRIEVAL_OPTIMIZATION_IMPLEMENTATION.md](RAG_RETRIEVAL_OPTIMIZATION_IMPLEMENTATION.md) | RAG 双层检索（prefilter + cosine）的实现细节、调优历史 | 优化检索质量 |

## 部署与运维

| 文档 | 说明 | 何时看 |
|---|---|---|
| [../DEPLOYMENT.md](../DEPLOYMENT.md) | 每个版本（v1.3.0 / v1.2.2 / v1.2.1 / v1.2.0 / v1.1.0）的部署步骤、回滚方法、验证清单 | 升级服务 |
| [../CHANGELOG.md](../CHANGELOG.md) | 版本变更记录（按 Keep a Changelog 格式） | 了解历史变更 |

## 前端对接

| 文档 | 说明 | 何时看 |
|---|---|---|
| [FRONTEND_DATA_CONTRACT.md](FRONTEND_DATA_CONTRACT.md) | 前端组件与后端 API 的字段映射、归一化规则 | 前端调后端接口、字段对不上时排查 |

## 按角色推荐阅读顺序

### 新加入的后端开发
1. [../README.md](../README.md)
2. [../ARCHITECTURE.md](../ARCHITECTURE.md)
3. [API.md](API.md)
4. [DATA_FLOW.md](DATA_FLOW.md)
5. [WIKI_UPLOAD_MODULE_DESIGN.md](WIKI_UPLOAD_MODULE_DESIGN.md)（理解 embedding 异步机制）

### 新加入的前端开发
1. [../README.md](../README.md)
2. [API_FRONTEND_TEAM.md](API_FRONTEND_TEAM.md)
3. [DATA_FLOW_FRONTEND_TEAM.md](DATA_FLOW_FRONTEND_TEAM.md)
4. [FRONTEND_DATA_CONTRACT.md](FRONTEND_DATA_CONTRACT.md)

### 新加入的 Agent（Python）开发
1. [../README.md](../README.md)
2. [../ARCHITECTURE.md](../ARCHITECTURE.md)（重点看 LangGraph 工作流 + 节点体系）
3. [RAG_RETRIEVAL_OPTIMIZATION_IMPLEMENTATION.md](RAG_RETRIEVAL_OPTIMIZATION_IMPLEMENTATION.md)

### 运维 / 部署
1. [../README.md](../README.md)（Docker 部分）
2. [../DEPLOYMENT.md](../DEPLOYMENT.md)
3. [../CHANGELOG.md](../CHANGELOG.md)
