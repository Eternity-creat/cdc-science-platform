package com.cdc.cdcbackend.entity;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class WikiRule {
    private Long id;
    private Long entityId;      // BUG-NEW-1 fix: 新增 entityId 字段，与 wiki_rule 表 entity_id 列映射
    private String ruleType;    // MustInclude / MustNotSay
    private String content;
    private String applyEntityIds;
    private Integer status;
    private LocalDateTime createTime;
}