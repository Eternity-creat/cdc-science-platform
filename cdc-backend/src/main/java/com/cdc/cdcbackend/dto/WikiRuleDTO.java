package com.cdc.cdcbackend.dto;

import lombok.Data;

@Data
public class WikiRuleDTO {
    private Long id;
    private String ruleType;    // MustInclude / MustNotSay / FactRule
    private String content;
}
