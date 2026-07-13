package com.cdc.cdcbackend.controller;

import com.cdc.cdcbackend.common.Result;
import com.cdc.cdcbackend.dto.ArticleFormDropDownDTO;
import com.cdc.cdcbackend.service.ArticleFormService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/article/form")
public class ArticleFormController {

    @Resource
    private ArticleFormService articleFormService;

    @GetMapping("/dropdown")
    public Result<ArticleFormDropDownDTO> dropdown() {
        return Result.success(articleFormService.getFormDropDown());
    }
}