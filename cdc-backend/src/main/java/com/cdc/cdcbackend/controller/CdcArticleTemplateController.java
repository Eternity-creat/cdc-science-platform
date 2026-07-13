package com.cdc.cdcbackend.controller;
import com.cdc.cdcbackend.common.PageResult;
import com.cdc.cdcbackend.common.Result;
import com.cdc.cdcbackend.entity.CdcArticleTemplate;
import com.cdc.cdcbackend.service.CdcArticleTemplateService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/template")
public class CdcArticleTemplateController {

    @Resource
    private CdcArticleTemplateService templateService;

    // 查询所有模板
    @GetMapping("/list")
    public Result<List<CdcArticleTemplate>> list() {
        return Result.success(templateService.list());
    }

    // 分页查询模板
    @GetMapping("/list/paged")
    public Result<PageResult<CdcArticleTemplate>> listPaged(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "12") int size) {
        return Result.success(templateService.listPaged(page, size));
    }

    // 查询单个模板详情
    @GetMapping("/{id}")
    public Result<CdcArticleTemplate> get(@PathVariable Long id) {
        return Result.success(templateService.getById(id));
    }

    // 新增模板
    @PostMapping
    public Result<Integer> add(@RequestBody CdcArticleTemplate template) {
        return Result.success(templateService.add(template));
    }

    // 修改模板
    @PutMapping("/{id}")
    public Result<Integer> update(
            @PathVariable Long id,
            @RequestBody CdcArticleTemplate template
    ) {
        template.setId(id);
        return Result.success(templateService.update(template));
    }

    // 删除模板
    @DeleteMapping("/{id}")
    public Result<Integer> delete(@PathVariable Long id) {
        return Result.success(templateService.delete(id));
    }
}