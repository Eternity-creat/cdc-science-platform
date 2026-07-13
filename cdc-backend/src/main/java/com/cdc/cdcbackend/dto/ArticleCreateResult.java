package com.cdc.cdcbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ArticleCreateResult {
    private Long articleId;
    private Integer status;
    private WikiTemplateContext context;
}
