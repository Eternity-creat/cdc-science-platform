package com.cdc.cdcbackend.dto;

import lombok.Data;
import java.util.List;

@Data
public class WikiDetailDTO {
    private Long id;
    private Integer entityType;
    private String stdName;
    private String alias;
    private String summary;

    private List<WikiSegmentDTO> segments;   // 片段详情
    private List<WikiRuleDTO> rules;          // 规则详情（含 ruleType）
    private List<Long> relatedIds;           // 关联实体ID
}
