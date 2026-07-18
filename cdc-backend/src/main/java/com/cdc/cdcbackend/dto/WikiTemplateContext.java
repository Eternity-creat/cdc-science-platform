package com.cdc.cdcbackend.dto;

import lombok.Data;
import java.util.List;

@Data
public class WikiTemplateContext {
    private WikiEntityInfo entity;
    private WikiEntityInfo population;
    private WikiEntityInfo scene;
    private TemplateInfo template;
    private List<Long> entityIds;
    private List<WikiSegmentInfo> segments;
    private List<String> rules;
    private List<String> mustInclude;
    private List<String> mustNotSay;
    /** 文章正文中实际引用的知识片段数量（从 {ref:N} 标记统计） */
    private Integer citedSegmentCount;
    
    @Data
    public static class WikiEntityInfo {
        private Long id;
        private String stdName;
        private String alias;
        private String summary;
    }
    
    @Data
    public static class TemplateInfo {
        private Long id;
        private String templateName;
        private String purpose;
        private String tone;
        private String outlineStructure;
    }
    
    @Data
    public static class WikiSegmentInfo {
        private Long id;
        private Long entityId;
        /** 片段所属实体类型：1疾病、2疫苗、3人群、4场景 */
        private Integer entityType;
        private String content;
        private String source;
        /** 预计算的向量 JSON 字符串，如 "[0.1, 0.2, ...]" */
        private String embedding;
    }
}
