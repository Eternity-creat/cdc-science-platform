# CDC 科普平台 — 工作流模拟测试

独立测试目录，模拟完整的文章生成工作流，用于排查问题和验证交互。**测试完成后可直接删除整个 `test-workflow/` 文件夹。**

## 快速开始

```bash
cd cdc/test-workflow

# 1. 安装依赖（仅 express + cors）
npm install

# 2. 启动 Mock Server（端口 3001）
node mock-server.js

# 3a. 可视化测试（推荐）— 浏览器打开
# 直接双击 test-dashboard.html 或在浏览器中打开

# 3b. 自动化测试 — 终端执行
node run-test.js
```

## 文件说明

| 文件 | 用途 |
|------|------|
| `mock-server.js` | Express Mock Server，模拟全部 67 个 API（60 Java + 7 Agent） |
| `seed-data.js` | 模拟数据：文章、知识库、模板、LLM 配置、图片等 |
| `test-dashboard.html` | 可视化测试面板（浏览器打开，无需安装） |
| `run-test.js` | 自动化测试脚本（18 个测试套件，~80 个断言） |
| `package.json` | 仅 express + cors 两个依赖 |
| `issues-report.md` | 发现的问题和 UX 优化建议 |

## Mock Server 特性

- 完整的 Java Backend 响应格式：`{ code: 200, msg: "success", data: T }`
- 内存数据存储，支持 CRUD 操作
- 模拟 Agent 生成延迟（大纲 ~2s，初稿 ~3s）
- **默认启用 Bug 模拟**：`saveOutline` / `saveDraft` 会导致 `status=NULL`
  - 修复版端点：`PUT /api/article/:id/outline-fixed`（不影响 status）

## 测试覆盖

| 编号 | 测试套件 | 端点数 |
|------|---------|--------|
| 1 | 服务健康检查 | 2 |
| 2 | 表单下拉数据 | 1 |
| 3 | 创建文章（表单 + 文本） | 2 |
| 4 | AI 生成大纲 | 1 |
| 5 | 保存大纲（验证 Bug） | 2 |
| 6 | 确认大纲 | 1 |
| 7 | AI 生成初稿 | 1 |
| 8 | 保存初稿（验证 Bug） | 1 |
| 9 | 确认终稿 | 1 |
| 10 | 发布文章 | 1 |
| 11 | 自动保存 | 1 |
| 12 | 版本回退 | 2 |
| 13 | 知识库 CRUD | 5 |
| 14 | 模板 CRUD | 2 |
| 15 | LLM 配置 | 2 |
| 16 | Agent 端点 | 4 |
| 17 | 文章分页筛选 | 2 |
| 18 | 文章删除 | 2 |

## 清理

测试完成后直接删除整个目录即可：

```bash
# Windows
rd /s /q test-workflow

# Linux/Mac
rm -rf test-workflow
```

不会修改项目中任何已有文件。
