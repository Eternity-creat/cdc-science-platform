package com.cdc.cdcbackend.controller;
import com.cdc.cdcbackend.common.PageResult;
import com.cdc.cdcbackend.common.Result;
import com.cdc.cdcbackend.dto.WikiDetailDTO;
import com.cdc.cdcbackend.dto.WikiSegmentEmbeddingDTO;
import com.cdc.cdcbackend.entity.WikiEntity;
import com.cdc.cdcbackend.entity.WikiRelation;
import com.cdc.cdcbackend.entity.WikiRule;
import com.cdc.cdcbackend.entity.WikiSegment;
import com.cdc.cdcbackend.service.WikiService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/wiki")
public class WikiController {

    @Resource private WikiService wikiService;

    // ==================== 主表 CRUD ====================
    @GetMapping("/list")
    public Result<List<WikiDetailDTO>> list() {
        return Result.success(wikiService.listAll());
    }

    @GetMapping("/list/paged")
    public Result<PageResult<WikiDetailDTO>> listPaged(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "15") int size,
            @RequestParam(required = false) Integer type,
            @RequestParam(required = false) String keyword) {
        return Result.success(wikiService.listPaged(page, size, type, keyword));
    }

    @GetMapping("/{id}")
    public Result<WikiDetailDTO> get(@PathVariable Long id) {
        return Result.success(wikiService.getById(id));
    }

    @PostMapping
    public Result<Integer> add(@RequestBody WikiEntity entity) {
        return Result.success(wikiService.add(entity));
    }

    @PutMapping("/{id}")
    public Result<Integer> update(@PathVariable Long id, @RequestBody WikiEntity entity) {
        entity.setId(id);
        return Result.success(wikiService.update(entity));
    }

    @DeleteMapping("/{id}")
    public Result<Integer> delete(@PathVariable Long id) {
        return Result.success(wikiService.delete(id));
    }

    // ==================== 片段 Segment ====================
    @PostMapping("/segment")
    public Result<Integer> addSegment(@RequestBody WikiSegment segment) {
        return Result.success(wikiService.addSegment(segment));
    }
    @PutMapping("/segment/{id}")
    public Result<Integer> updateSegment(@PathVariable Long id, @RequestBody WikiSegment segment) {
        segment.setId(id);
        return Result.success(wikiService.updateSegment(segment));
    }
    @DeleteMapping("/segment/{id}")
    public Result<Integer> delSegment(@PathVariable Long id) {
        return Result.success(wikiService.deleteSegment(id));
    }

    /**
     * 查询实体的所有片段及其预计算 embedding 向量。
     * 前端获取后直接传给 Agent，Agent 用缓存向量做 top-k 检索，
     * 避免重新计算所有片段的 embedding。
     */
    @GetMapping("/entity/{entityId}/segments-with-embeddings")
    public Result<List<WikiSegmentEmbeddingDTO>> listSegmentsWithEmbeddings(@PathVariable Long entityId) {
        return Result.success(wikiService.listSegmentsWithEmbedding(entityId));
    }

    // ==================== 规则 Rule ====================
    @PostMapping("/rule")
    public Result<Integer> addRule(@RequestBody WikiRule rule) {
        return Result.success(wikiService.addRule(rule));
    }
    @PutMapping("/rule/{id}")
    public Result<Integer> updateRule(@PathVariable Long id, @RequestBody WikiRule rule) {
        rule.setId(id);
        return Result.success(wikiService.updateRule(rule));
    }
    @DeleteMapping("/rule/{id}")
    public Result<Integer> delRule(@PathVariable Long id) {
        return Result.success(wikiService.deleteRule(id));
    }

    // ==================== 关联 Relation ====================
    @PostMapping("/relation")
    public Result<Integer> addRelation(@RequestBody WikiRelation relation) {
        return Result.success(wikiService.addRelation(relation));
    }
    @PutMapping("/relation/{id}")
    public Result<Integer> updateRelation(@PathVariable Long id, @RequestBody WikiRelation relation) {
        relation.setId(id);
        return Result.success(wikiService.updateRelation(relation));
    }
    @DeleteMapping("/relation/{id}")
    public Result<Integer> delRelation(@PathVariable Long id) {
        return Result.success(wikiService.deleteRelation(id));
    }
}