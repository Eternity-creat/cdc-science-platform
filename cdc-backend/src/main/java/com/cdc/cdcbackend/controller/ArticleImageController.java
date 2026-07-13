package com.cdc.cdcbackend.controller;
import com.cdc.cdcbackend.common.Result;
import com.cdc.cdcbackend.entity.CdcArticleImage;
import com.cdc.cdcbackend.service.ArticleImageService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/article-image")
public class ArticleImageController {
    @Resource
    private ArticleImageService imageService;

    @GetMapping("/article/{articleId}")
    public Result<List<CdcArticleImage>> listByArticle(@PathVariable Long articleId) {
        return Result.success(imageService.listByArticleId(articleId));
    }

    @GetMapping("/{id}")
    public Result<CdcArticleImage> getById(@PathVariable Long id) {
        return Result.success(imageService.getById(id));
    }

    @PostMapping
    public Result<CdcArticleImage> save(@RequestBody CdcArticleImage image) {
        return Result.success(imageService.save(image));
    }

    @PostMapping("/batch")
    public Result<List<CdcArticleImage>> saveBatch(@RequestBody List<CdcArticleImage> images) {
        List<CdcArticleImage> saved = new ArrayList<>();
        for (CdcArticleImage img : images) {
            saved.add(imageService.save(img));
        }
        return Result.success(saved);
    }

    @PutMapping("/{id}")
    public Result<Integer> update(@PathVariable Long id, @RequestBody CdcArticleImage image) {
        image.setId(id);
        return Result.success(imageService.update(image));
    }

    @DeleteMapping("/{id}")
    public Result<Integer> delete(@PathVariable Long id) {
        return Result.success(imageService.delete(id));
    }

    @PutMapping("/{id}/caption")
    public Result<Integer> updateCaption(@PathVariable Long id, @RequestBody Map<String, String> body) {
        CdcArticleImage image = imageService.getById(id);
        if (image == null) return Result.success(0);
        image.setCaption(body.get("caption"));
        return Result.success(imageService.update(image));
    }
}
