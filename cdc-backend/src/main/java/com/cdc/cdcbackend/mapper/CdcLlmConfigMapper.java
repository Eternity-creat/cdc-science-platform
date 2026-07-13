package com.cdc.cdcbackend.mapper;
import com.cdc.cdcbackend.entity.CdcLlmConfig;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface CdcLlmConfigMapper {
    List<CdcLlmConfig> listAll();
    List<CdcLlmConfig> listByType(@Param("configType") String configType);
    CdcLlmConfig getById(@Param("id") Long id);
    CdcLlmConfig getDefaultByType(@Param("configType") String configType);
    int insert(CdcLlmConfig config);
    int update(CdcLlmConfig config);
    int delete(@Param("id") Long id);
    int setDefault(@Param("id") Long id, @Param("configType") String configType);
    int clearDefault(@Param("configType") String configType);
}
