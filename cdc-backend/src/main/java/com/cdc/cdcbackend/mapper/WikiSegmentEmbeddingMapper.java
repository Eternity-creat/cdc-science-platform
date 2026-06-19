package com.cdc.cdcbackend.mapper;
import com.cdc.cdcbackend.entity.WikiSegmentEmbedding;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface WikiSegmentEmbeddingMapper {
    WikiSegmentEmbedding getBySegmentId(@Param("segmentId") Long segmentId);
    List<WikiSegmentEmbedding> listByEntityId(@Param("entityId") Long entityId);
    int insert(WikiSegmentEmbedding embedding);
    int upsert(WikiSegmentEmbedding embedding);
    int deleteBySegmentId(@Param("segmentId") Long segmentId);
}
