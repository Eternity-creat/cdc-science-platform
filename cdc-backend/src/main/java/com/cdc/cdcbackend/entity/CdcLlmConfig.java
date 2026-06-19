package com.cdc.cdcbackend.entity;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class CdcLlmConfig {
    private Long id;
    private String configName;       // 配置显示名称
    private String configType;       // text_generation/fact_check/rule_check/intent_parse/reflect_iterate/embedding/image_generation
    private String provider;         // 模型提供商 (dashscope/openai/custom)
    private String modelName;        // 模型标识 (qwen-turbo, etc.)
    private String apiKeyEncrypted;  // 加密后的 API Key
    private String baseUrl;          // 自定义 API 端点
    private String params;           // JSON: {temperature, max_tokens, top_p, ...}
    private Integer isDefault;       // 是否为该类型的默认配置
    private Integer isEnabled;       // 是否启用
    private String description;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
