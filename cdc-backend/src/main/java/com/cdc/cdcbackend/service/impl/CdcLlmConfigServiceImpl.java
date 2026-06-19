package com.cdc.cdcbackend.service.impl;
import com.cdc.cdcbackend.entity.CdcLlmConfig;
import com.cdc.cdcbackend.mapper.CdcLlmConfigMapper;
import com.cdc.cdcbackend.service.CdcLlmConfigService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
public class CdcLlmConfigServiceImpl implements CdcLlmConfigService {
    @Resource
    private CdcLlmConfigMapper configMapper;

    @Override
    public List<CdcLlmConfig> listAll() {
        return configMapper.listAll();
    }

    @Override
    public List<CdcLlmConfig> listByType(String configType) {
        return configMapper.listByType(configType);
    }

    @Override
    public CdcLlmConfig getById(Long id) {
        return configMapper.getById(id);
    }

    @Override
    public CdcLlmConfig getDefaultByType(String configType) {
        return configMapper.getDefaultByType(configType);
    }

    @Override
    @Transactional
    public CdcLlmConfig add(CdcLlmConfig config) {
        if (config.getProvider() == null) config.setProvider("dashscope");
        if (config.getIsEnabled() == null) config.setIsEnabled(1);
        if (config.getIsDefault() == null) config.setIsDefault(0);

        // MySQL JSON 列不接受空字符串，必须为合法 JSON 或 null
        sanitizeParams(config);

        // If this is the first config for this type, make it default
        List<CdcLlmConfig> existing = configMapper.listByType(config.getConfigType());
        if (existing.isEmpty()) {
            config.setIsDefault(1);
        }

        configMapper.insert(config);
        return config;
    }

    @Override
    public int update(CdcLlmConfig config) {
        sanitizeParams(config);
        // 多配置模式下，前端不传 isDefault 时保留数据库中的原值
        if (config.getIsDefault() == null) {
            CdcLlmConfig existing = configMapper.getById(config.getId());
            if (existing != null) {
                config.setIsDefault(existing.getIsDefault());
            }
        }
        return configMapper.update(config);
    }

    /**
     * params 列是 MySQL JSON 类型，空字符串会触发 DataTruncation。
     * 空或空白字符串统一置为 null。
     */
    private void sanitizeParams(CdcLlmConfig config) {
        String params = config.getParams();
        if (params != null && params.isBlank()) {
            config.setParams(null);
        }
    }

    @Override
    public int delete(Long id) {
        return configMapper.delete(id);
    }

    @Override
    @Transactional
    public int setAsDefault(Long id) {
        CdcLlmConfig config = configMapper.getById(id);
        if (config == null) return 0;
        // Clear existing default for this type, then set new default
        configMapper.clearDefault(config.getConfigType());
        return configMapper.setDefault(id, config.getConfigType());
    }
}
