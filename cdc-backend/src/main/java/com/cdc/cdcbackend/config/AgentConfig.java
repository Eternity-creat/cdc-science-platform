package com.cdc.cdcbackend.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@ConfigurationProperties(prefix = "agent.service")
public class AgentConfig {
    private String url = "http://localhost:8001";
    private int timeout = 60000;
}
