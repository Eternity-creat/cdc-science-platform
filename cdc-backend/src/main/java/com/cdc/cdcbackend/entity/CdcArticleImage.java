package com.cdc.cdcbackend.entity;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class CdcArticleImage {
    private Long id;
    private Long articleId;
    private String imageKey;        // img_001
    private String filePath;        // 存储路径
    private String caption;         // 图片说明
    private Integer position;       // 段落位置
    private String generatedBy;     // 生成模型
    private String generationPrompt;
    private Integer width;
    private Integer height;
    private Long fileSize;
    private Integer status;         // 1=正常 0=已删除
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
