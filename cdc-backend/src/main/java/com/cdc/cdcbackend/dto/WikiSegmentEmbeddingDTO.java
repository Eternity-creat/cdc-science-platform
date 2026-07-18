package com.cdc.cdcbackend.dto;

import lombok.Data;

/**
 * 片段 + 预计算向量的联合 DTO。
 * 用于前端获取片段后直接传给 Agent 做 top-k 检索，
 * 避免 Agent 重新计算所有片段的 embedding。
 */
@Data
public class WikiSegmentEmbeddingDTO {
    private Long id;
    private Long entityId;
    /** 片段所属实体类型：1疾病、2疫苗、3人群、4场景 */
    private Integer entityType;
    private String content;
    private String source;
    /** 预计算的向量 JSON 字符串，如 "[0.1, 0.2, ...]" */
    private String embedding;
    /** 向量维度 */
    private Integer dimensions;
    /** embedding 使用的模型版本 */
    private String modelVersion;
}
