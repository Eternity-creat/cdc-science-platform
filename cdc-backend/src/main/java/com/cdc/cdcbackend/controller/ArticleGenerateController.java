package com.cdc.cdcbackend.controller;

import com.cdc.cdcbackend.common.Result;
import com.cdc.cdcbackend.dto.ArticleCreateResult;
import com.cdc.cdcbackend.entity.CdcArticleRequest;
import com.cdc.cdcbackend.service.ArticleService;
import com.cdc.cdcbackend.service.CdcArticleRequestService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.*;
import java.util.Map;


@RestController
@RequestMapping("/api/article")
public class ArticleGenerateController {

    @Resource
    private CdcArticleRequestService requestService;
    @Resource
    private ArticleService articleService;

    /**
     * 前端表单提交入口：保存表单参数+创建空文章，返回文章ID和上下文
     */
    @PostMapping("/generate")
    public Result<ArticleCreateResult> generate(@RequestBody CdcArticleRequest request) {
        ArticleCreateResult result = articleService.createArticle(request);
        return Result.success(result);
    }

    /**
     * 获取文章的上下文（实体、片段、规则等）
     */
    @GetMapping("/context/{id}")
    public Result<?> getContext(@PathVariable Long id) {
        return Result.success(articleService.getContext(id));
    }

    // 查询单条表单提交记录
    @GetMapping("/record/{id}")
    public Result<CdcArticleRequest> getRecord(@PathVariable Long id) {
        return Result.success(requestService.getById(id));
    }

    // 查询全部表单提交记录
    @GetMapping("/record/list")
    public Result<?> list() {
        return Result.success(requestService.listAll());
    }

    /**
     * 自由文本模式：用户输入自由文本，系统解析意图后生成文章
     */
    @PostMapping("/generate/text")
    public Result<ArticleCreateResult> generateFromText(@RequestBody Map<String, Object> params) {
        String userText = (String) params.get("userText");
        Long templateId = Long.valueOf(params.get("templateId").toString());
        
        ArticleCreateResult result = articleService.generateFromText(userText, templateId);
        return Result.success(result);
    }
}
