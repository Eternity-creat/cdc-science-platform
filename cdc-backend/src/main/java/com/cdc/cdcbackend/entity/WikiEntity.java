package com.cdc.cdcbackend.entity;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class WikiEntity {
    private Long id;
    private Integer entityType;    // 1疾病 2疫苗 3人群 4场景
    private String stdName;
    private String alias;
    private String summary;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}