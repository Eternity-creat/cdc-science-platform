package com.cdc.cdcbackend.controller;

import com.cdc.cdcbackend.common.PageResult;
import com.cdc.cdcbackend.common.Result;
import com.cdc.cdcbackend.dto.ArticleListItemDTO;
import com.cdc.cdcbackend.entity.CdcArticle;
import com.cdc.cdcbackend.entity.CdcArticleModification;
import com.cdc.cdcbackend.entity.CdcAgentTrace;
import com.cdc.cdcbackend.service.ArticleService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import jakarta.annotation.Resource;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/article")
public class ArticleController {

    @Resource private ArticleService articleService;

    // 1. 文章列表（JOIN 查询，含模板名、实体名、修改次数）
    @GetMapping("/list")
    public Result<List<ArticleListItemDTO>> list() {
        return Result.success(articleService.listArticles());
    }

    // 1b. 文章列表（分页）
    @GetMapping("/list/paged")
    public Result<PageResult<ArticleListItemDTO>> listPaged(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) Integer status,
            @RequestParam(required = false) String keyword) {
        return Result.success(articleService.listArticlesPaged(page, size, status, keyword));
    }

    // 2. 获取文章
    @GetMapping("/{id}")
    public Result<CdcArticle> get(@PathVariable Long id) {
        return Result.success(articleService.getArticle(id));
    }

    // 3. AI生成大纲
    @PostMapping("/{id}/generate-outline")
    public Result<String> outline(@PathVariable Long id) {
        return Result.success(articleService.generateOutline(id));
    }

    @PostMapping("/{id}/generate-outline/stream")
    public SseEmitter outlineStream(@PathVariable Long id) {
        return articleService.generateOutlineStream(id);
    }

    // 4. AI生成初稿
    @PostMapping("/{id}/generate-draft")
    public Result<String> draft(@PathVariable Long id) {
        return Result.success(articleService.generateDraft(id));
    }

    @PostMapping("/{id}/generate-draft/stream")
    public SseEmitter draftStream(@PathVariable Long id) {
        return articleService.generateDraftStream(id);
    }

    // 5. 保存编辑大纲（自动留痕）
    @PutMapping("/{id}/outline")
    public Result<Boolean> saveOutline(@PathVariable Long id, @RequestBody String content) {
        return Result.success(articleService.saveOutline(id, content));
    }

    // 6. 保存编辑初稿（自动留痕）
    @PutMapping("/{id}/draft")
    public Result<Boolean> saveDraft(@PathVariable Long id, @RequestBody String content) {
        return Result.success(articleService.saveDraft(id, content));
    }

    // 7. 确认大纲（保存大纲内容，状态保持 2）
    @PostMapping("/{id}/confirm-outline")
    public Result<Boolean> confirmOutline(@PathVariable Long id, @RequestBody(required = false) String content) {
        return Result.success(articleService.confirmOutline(id, content));
    }

    // 8. 确认初稿为终稿（status 3 → 4）
    @PostMapping("/{id}/confirm-draft")
    public Result<Boolean> confirmDraft(@PathVariable Long id) {
        return Result.success(articleService.confirmDraft(id));
    }

    // 9. 重新生成大纲（保留旧版本到修改历史）
    @PostMapping("/{id}/regenerate-outline")
    public Result<String> regenerateOutline(@PathVariable Long id) {
        return Result.success(articleService.regenerateOutline(id));
    }

    @PostMapping("/{id}/regenerate-outline/stream")
    public SseEmitter regenerateOutlineStream(@PathVariable Long id) {
        return articleService.regenerateOutlineStream(id);
    }

    // 10. 重新生成初稿（保留旧版本到修改历史）
    @PostMapping("/{id}/regenerate-draft")
    public Result<String> regenerateDraft(@PathVariable Long id) {
        return Result.success(articleService.regenerateDraft(id));
    }

    @PostMapping("/{id}/regenerate-draft/stream")
    public SseEmitter regenerateDraftStream(@PathVariable Long id) {
        return articleService.regenerateDraftStream(id);
    }

    // 11. 自动保存（轻量，不记录修改历史）
    @PostMapping("/{id}/autosave")
    public Result<Boolean> autoSave(@PathVariable Long id, @RequestBody Map<String, String> body) {
        // BUG-NEW-10 fix: 输入校验
        if (body == null || !body.containsKey("content")) {
            return Result.fail("缺少必填参数: content");
        }
        String field = body.getOrDefault("field", "outline");
        String content = body.get("content");
        return Result.success(articleService.autoSave(id, field, content));
    }

    // 12. 回退到历史版本
    @PostMapping("/{id}/revert")
    public Result<CdcArticle> revert(@PathVariable Long id, @RequestBody Map<String, Long> body) {
        // BUG-NEW-10 fix: 输入校验
        if (body == null || body.get("modificationId") == null) {
            return Result.fail("缺少必填参数: modificationId");
        }
        Long modificationId = body.get("modificationId");
        return Result.success(articleService.revertToModification(id, modificationId));
    }

    // 13. 确认终稿（兼容旧接口）
    @PostMapping("/{id}/confirm")
    public Result<Boolean> confirm(@PathVariable Long id) {
        return Result.success(articleService.confirmFinal(id));
    }

    // 14. 修改记录
    @GetMapping("/{id}/modifications")
    public Result<List<CdcArticleModification>> modifications(@PathVariable Long id) {
        return Result.success(articleService.getModifications(id));
    }

    // 15. Agent轨迹
    @GetMapping("/{id}/trace")
    public Result<List<CdcAgentTrace>> trace(@PathVariable Long id) {
        return Result.success(articleService.getAgentTrace(id));
    }

    // 16. 删除文章（级联清理留痕 + 轨迹）
    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable Long id) {
        return Result.success(articleService.deleteArticle(id));
    }
}
