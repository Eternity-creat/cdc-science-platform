package com.cdc.cdcbackend.mapper;
import com.cdc.cdcbackend.dto.WikiSegmentEmbeddingDTO;
import com.cdc.cdcbackend.entity.WikiSegment;
import org.apache.ibatis.annotations.Mapper;
import java.util.List;

@Mapper
public interface WikiSegmentMapper {
    List<WikiSegment> listByEntityId(Long entityId);
    /** 查询实体的所有片段，LEFT JOIN 预计算向量 */
    List<WikiSegmentEmbeddingDTO> listWithEmbeddingByEntityId(Long entityId);
    int insert(WikiSegment segment);
    int update(WikiSegment segment);
    int delete(Long id);
    int deleteByEntityId(Long entityId);
}