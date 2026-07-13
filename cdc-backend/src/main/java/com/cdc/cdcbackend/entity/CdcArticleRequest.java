package com.cdc.cdcbackend.entity;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class CdcArticleRequest {
    private Long id;
    private Integer mode;           // 1表单 2自由文本
    private Integer entityType;     // 1疾病 2疫苗
    private Long entityId;
    private Long populationId;
    private Long sceneId;
    private Long templateId;
    private Integer wordCount;
    private String userText;
    private LocalDateTime createTime;
}