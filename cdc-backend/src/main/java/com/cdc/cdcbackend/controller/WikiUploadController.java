package com.cdc.cdcbackend.controller;

import com.cdc.cdcbackend.common.Result;
import com.cdc.cdcbackend.dto.WikiUploadConfirmResultDTO;
import com.cdc.cdcbackend.dto.WikiUploadPreviewDTO;
import com.cdc.cdcbackend.service.WikiUploadService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/wiki/upload")
public class WikiUploadController {

    @Resource
    private WikiUploadService wikiUploadService;

    @PostMapping
    public Result<WikiUploadPreviewDTO> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false, defaultValue = "1") Integer entityType) {
        return Result.success(wikiUploadService.uploadAndPreview(file, entityType));
    }

    @GetMapping("/{taskId}")
    public Result<WikiUploadPreviewDTO> preview(@PathVariable Long taskId) {
        return Result.success(wikiUploadService.getPreview(taskId));
    }

    @PostMapping("/{taskId}/confirm")
    public Result<WikiUploadConfirmResultDTO> confirm(@PathVariable Long taskId) {
        return Result.success(wikiUploadService.confirm(taskId));
    }
}
