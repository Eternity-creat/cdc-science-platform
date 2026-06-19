package com.cdc.cdcbackend.mapper;
import com.cdc.cdcbackend.entity.CdcEmbeddingCache;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface CdcEmbeddingCacheMapper {
    /** 按 content_hash + model_version 查询单条 */
    CdcEmbeddingCache getByHashAndModel(@Param("contentHash") String contentHash,
                                         @Param("modelVersion") String modelVersion);

    /** 批量查询（同一模型版本） */
    List<CdcEmbeddingCache> listByHashesAndModel(@Param("hashes") List<String> hashes,
                                                   @Param("modelVersion") String modelVersion);

    /** 写入或更新（幂等） */
    int upsert(CdcEmbeddingCache cache);
}
