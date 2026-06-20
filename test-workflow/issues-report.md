# CDC 科普平台 — 问题报告

> 基于源码分析和工作流模拟测试发现的问题汇总
>
> 生成时间：2024-06-20

---

## Bug（需修复）

### BUG-1: 保存大纲/初稿后 status 被覆盖为 NULL [P0]

**现象：** 点击"保存"按钮后，文章状态从正常值（2 或 3）变为 NULL，导致前端显示"未知"状态，所有依赖 status 的逻辑全部失效。

**根因分析：**

1. **MyBatis SQL** (`CdcArticleMapper.xml`)：
```xml
<update id="updateOutline">
    UPDATE cdc_article SET outline=#{outline}, status=#{status} WHERE id=#{id}
</update>
```
SQL 无条件 SET status 字段。

2. **Service 层** (`ArticleServiceImpl.saveOutline()`)：
```java
CdcArticle up = new CdcArticle();
up.setId(id);
up.setOutline(newContent);
// ❌ 从未调用 up.setStatus()，status 为 null
return articleMapper.updateOutline(up) > 0;
```

3. 最终执行的 SQL 变成：
```sql
UPDATE cdc_article SET outline='...', status=NULL WHERE id=123
```

**影响范围：**
- `saveOutline()` 和 `saveDraft()` 两个方法都有同样的问题
- 保存后文章 status 丢失，前端 phase 判断逻辑异常
- 文章列表中的状态筛选也会受影响

**修复方案：**

方案 A（最小改动）— Service 层保留 status：
```java
@Override
public boolean saveOutline(Long id, String newContent) {
    CdcArticle old = getArticle(id);
    // ... modification record ...
    CdcArticle up = new CdcArticle();
    up.setId(id);
    up.setOutline(newContent);
    up.setStatus(old.getStatus());  // ← 加上这一行
    return articleMapper.updateOutline(up) > 0;
}
```

方案 B（更规范）— SQL 条件更新：
```xml
<update id="updateOutline">
    UPDATE cdc_article SET outline=#{outline}
    <if test="status != null">, status=#{status}</if>
    WHERE id=#{id}
</update>
```

**涉及文件：**
- `cdc-backend/src/main/java/com/cdc/cdcbackend/service/impl/ArticleServiceImpl.java`
- `cdc-backend/src/main/resources/mapper/CdcArticleMapper.xml`

---

## UX 问题（建议优化）

### UX-1: 保存操作无成功反馈 [P1]

**问题：** `handleSaveOutline()` 和 `handleSaveDraft()` 保存成功后没有任何用户可见的反馈。用户点击保存后看不到变化，以为操作失败了。

**位置：** `Workbench.jsx` 的 `handleSaveOutline` 和 `handleSaveDraft`

**建议：** 使用 shadcn/ui 的 `useToast()` 添加成功提示：
```jsx
import { useToast } from '../components/ui/use-toast';
// ...
const handleSaveOutline = async () => {
  try {
    await articleApi.saveOutline(id, editOutline);
    toast({ title: '保存成功', description: '大纲已保存' });
    // 或提供跳转选项
  } catch (e) {
    toast({ title: '保存失败', description: e.message, variant: 'destructive' });
  }
};
```

### UX-2: 保存后缺少"返回"选项 [P1]

**问题：** 保存按钮只有"保存"一个行为，没有"保存并返回列表"的选项。

**建议：**
- 方案 A：在保存按钮旁增加一个"保存并返回"按钮
- 方案 B：保存成功后自动显示一个 Toast，内含"返回列表"的链接
- 方案 C：保存成功后自动 `navigate('/articles')`，但这样会中断编辑流

推荐方案 A，让用户自行选择。

### UX-3: 错误处理只有 console.error [P2]

**问题：** 所有 catch 块只写 `console.error()`，用户看不到任何错误信息。网络异常或 API 超时时无提示。

**建议：** 统一使用 Toast 展示错误信息，并提供重试按钮。

### UX-4: 自动保存与手动保存可能冲突 [P2]

**问题：** Workbench 有防抖自动保存（2s），用户手动保存时如果自动保存也触发，可能产生重复请求。

**建议：** 在 `handleSave*` 开头加上 `clearTimeout(autoSaveTimer.current)` 取消 pending 的自动保存。

### UX-5: 空状态缺少引导 [P2]

**问题：** 文章列表为空时、知识库为空时，只显示简单的"暂无数据"，缺少引导性的空状态页面。

**建议：** 设计引导性空状态（插图 + 说明 + 行动按钮），例如"还没有文章，点击创建第一篇科普文章"。

---

## 交互优化建议

### OPT-1: 大纲编辑阶段的移动端体验

当前大纲树面板在手机上需要手动点击切换按钮才能显示/隐藏。可以考虑：
- 在窄屏幕上将大纲树做成底部抽屉（Bottom Sheet）
- 大纲树和编辑器用 Tab 切换而非左右分栏

### OPT-2: 生成进度的可视化

当前 Agent 生成时只有简单的 loading 动画。建议：
- 实时展示 Pipeline 各步骤的状态（进行中/完成/耗时）
- 使用 SSE 流式传输让生成内容逐段出现

### OPT-3: 知识库编辑的批量操作

当前知识库条目需要逐个添加片段和规则。建议：
- 支持批量导入（CSV/Excel）
- 支持复制粘贴批量添加知识片段

---

## 测试验证

上述所有问题均通过 `test-workflow/` 目录中的 Mock Server 和测试面板进行了验证：

- `run-test.js`：18 个测试套件，~80 个断言，BUG-1 的 status=NULL 问题已被自动检测并标记为 ⚠️ 警告
- `test-dashboard.html`：可视化面板中可逐步点击测试，实时查看 API 请求/响应和状态变化
