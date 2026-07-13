package com.cdc.cdcbackend.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ArticleListItemDTO {
    private Long id;
    private Long requestId;
    private Integer status;
    private String templateName;
    private String entityName;
    private Integer entityType;
    private Integer mode;
    private String userText;
    private Integer modifyCount;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
