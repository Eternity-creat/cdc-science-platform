package com.cdc.cdcbackend.service;

import com.cdc.cdcbackend.common.PageResult;
import com.cdc.cdcbackend.dto.ArticleCreateResult;
import com.cdc.cdcbackend.dto.ArticleListItemDTO;
import com.cdc.cdcbackend.dto.WikiTemplateContext;
import com.cdc.cdcbackend.entity.CdcArticle;
import com.cdc.cdcbackend.entity.CdcArticleModification;
import com.cdc.cdcbackend.entity.CdcAgentTrace;
import com.cdc.cdcbackend.entity.CdcArticleRequest;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import java.util.List;

public interface ArticleService {

    Long createEmptyArticle(Long requestId, Long templateId);

    CdcArticle getArticle(Long id);

    List<ArticleListItemDTO> listArticles();

    PageResult<ArticleListItemDTO> listArticlesPaged(int page, int size, Integer status, String keyword);

    // 创建文章并返回上下文
    ArticleCreateResult createArticle(CdcArticleRequest request);

    // 根据文章ID获取上下文
    WikiTemplateContext getContext(Long articleId);

    String generateOutline(Long articleId);

    String generateDraft(Long articleId);

    SseEmitter generateOutlineStream(Long articleId);

    SseEmitter generateDraftStream(Long articleId);

    // 自由文本模式：先解析意图，再生成文章
    ArticleCreateResult generateFromText(String userText, Long templateId);

    boolean saveOutline(Long id, String content);

    boolean saveDraft(Long id, String content);

    // 确认大纲（保存后保持 status=2，前端随后调 generateDraft）
    boolean confirmOutline(Long id, String content);

    // 确认初稿为终稿（status 3 → 4）
    boolean confirmDraft(Long id);

    // 重新生成大纲（保留旧版本到修改历史）
    String regenerateOutline(Long articleId);

    // 重新生成初稿（保留旧版本到修改历史）
    String regenerateDraft(Long articleId);

    SseEmitter regenerateOutlineStream(Long articleId);

    SseEmitter regenerateDraftStream(Long articleId);

    // 自动保存（不记录修改历史）
    boolean autoSave(Long id, String field, String content);

    // 回退到历史版本
    boolean revertToModification(Long articleId, Long modificationId);

    boolean confirmFinal(Long id);

    List<CdcArticleModification> getModifications(Long articleId);

    List<CdcAgentTrace> getAgentTrace(Long articleId);

    // 删除文章（级联清理留痕记录和 Agent 轨迹）
    boolean deleteArticle(Long id);
}
