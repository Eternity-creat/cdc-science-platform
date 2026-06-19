package com.cdc.cdcbackend.service;
import com.cdc.cdcbackend.entity.CdcLlmConfig;
import java.util.List;

public interface CdcLlmConfigService {
    List<CdcLlmConfig> listAll();
    List<CdcLlmConfig> listByType(String configType);
    CdcLlmConfig getById(Long id);
    CdcLlmConfig getDefaultByType(String configType);
    CdcLlmConfig add(CdcLlmConfig config);
    int update(CdcLlmConfig config);
    int delete(Long id);
    int setAsDefault(Long id);
}
