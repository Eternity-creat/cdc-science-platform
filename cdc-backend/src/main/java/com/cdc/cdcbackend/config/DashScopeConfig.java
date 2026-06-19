package com.cdc.cdcbackend.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@ConfigurationProperties(prefix = "dashscope")
public class DashScopeConfig {
    private String apiKey = "";
    private String embeddingModel = "text-embedding-v2";
    private String baseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1";
}
