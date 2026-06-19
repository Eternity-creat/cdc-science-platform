package com.cdc.cdcbackend.entity;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class WikiRule {
    private Long id;
    private String ruleType;    // MustInclude / MustNotSay
    private String content;
    private String applyEntityIds;
    private Integer status;
    private LocalDateTime createTime;
}