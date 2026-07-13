# Wiki 上传接口使用说明

更新时间：2026-07-02

## 当前实现范围

已实现后端上传模块第一版：

- 支持文件类型：`json`、`md`、`txt`、`docx`、`pdf`
- 上传后先解析成预览，不直接入库
- 确认入库时按 `entityType + stdName` 判断同名实体
- 同名实体采用覆盖策略：删除旧实体的片段、规则、关联后重新写入
- 新增片段会触发现有 `SegmentChangedEvent`，后续 embedding 配好后可复用现有向量补算逻辑

## 接口

### 1. 上传并生成预览

```http
POST /api/wiki/upload?entityType=2
Content-Type: multipart/form-data
```

表单字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| file | file | 是 | 上传文件，支持 `json/md/txt/docx/pdf` |
| entityType | query int | 否 | 非 JSON 文件使用；`1` 疾病，`2` 疫苗，`3` 人群，`4` 场景；默认 `1` |

返回：

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": 1,
    "fileName": "demo.md",
    "fileType": "md",
    "status": 1,
    "entityCount": 1,
    "segmentCount": 2,
    "ruleCount": 0,
    "warnings": [],
    "entities": []
  }
}
```

### 2. 查看上传预览

```http
GET /api/wiki/upload/{taskId}
```

用于前端预览页刷新、重新打开审核弹窗。

### 3. 确认入库

```http
POST /api/wiki/upload/{taskId}/confirm
```

返回：

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": 1,
    "insertedCount": 1,
    "overwrittenCount": 0,
    "segmentCount": 2,
    "ruleCount": 0,
    "overwrittenNames": []
  }
}
```

## 任务状态

| status | 含义 |
| --- | --- |
| 0 | 已上传，未完成解析 |
| 1 | 已解析，待审核确认 |
| 2 | 已确认入库 |
| 3 | 解析或处理失败 |

## 推荐 JSON 格式

```json
{
  "entities": [
    {
      "entityType": 2,
      "stdName": "流感疫苗",
      "alias": ["流行性感冒疫苗", "Influenza vaccine"],
      "summary": "用于预防流行性感冒的疫苗。",
      "segments": [
        {
          "content": "流感疫苗可降低流感感染和重症风险。",
          "source": "权威指南"
        }
      ],
      "rules": [
        {
          "ruleType": "MustInclude",
          "content": "涉及接种建议时应提示以当地疾控或医疗机构安排为准。"
        }
      ],
      "mustNotSay": [
        "不要表述为接种后一定不会感染流感。"
      ]
    }
  ]
}
```

也支持直接上传单个实体对象，或实体数组。

## 非 JSON 文件解析规则

`md/txt/docx/pdf` 暂按轻量规则处理：

- 文件名作为实体名
- Markdown 一级标题 `# 标题` 优先作为实体名
- 第一段正文作为 `summary`
- 正文按段落切为 `segments`
- 以下前缀会被识别为规则：
  - `MustInclude:`
  - `MustInclude：`
  - `必须包含:`
  - `必须包含：`
  - `MustNotSay:`
  - `MustNotSay：`
  - `禁止表述:`
  - `禁止表述：`
  - `不能说:`
  - `不能说：`

## 本地验证结果

已使用 `docs/AGENT_MOCK_MODE.md` 测试预览：

- `POST /api/wiki/upload?entityType=2`：通过，返回 `code=200`
- `GET /api/wiki/upload/1`：通过，返回 `status=1`

已使用临时 Markdown 文件测试完整链路：

- `POST /api/wiki/upload?entityType=1`：通过，返回 `code=200`
- `POST /api/wiki/upload/{taskId}/confirm`：通过，写入 1 个实体、1 个片段、1 条规则
- `DELETE /api/wiki/{id}`：通过，临时测试实体已删除

上述烟测产生的临时实体、上传任务记录和上传副本文件均已清理。
