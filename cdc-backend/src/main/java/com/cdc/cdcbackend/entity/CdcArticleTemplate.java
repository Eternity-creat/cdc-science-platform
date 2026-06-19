package com.cdc.cdcbackend.entity;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class CdcArticleTemplate {
    private Long id;
    private String templateName;
    private String tag;
    private String purpose;
    private String tone;           // JSON数组
    private String outlineStructure; // JSON数组
    private Integer status;
    private LocalDateTime createTime;
}