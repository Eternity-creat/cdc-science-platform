package com.cdc.cdcbackend.service;
import com.cdc.cdcbackend.common.PageResult;
import com.cdc.cdcbackend.dto.WikiDetailDTO;
import com.cdc.cdcbackend.dto.WikiSegmentEmbeddingDTO;
import com.cdc.cdcbackend.entity.WikiEntity;
import com.cdc.cdcbackend.entity.WikiRelation;
import com.cdc.cdcbackend.entity.WikiRule;
import com.cdc.cdcbackend.entity.WikiSegment;
import java.util.List;

public interface WikiService {
    List<WikiDetailDTO> listAll();
    PageResult<WikiDetailDTO> listPaged(int page, int size, Integer type, String keyword);
    WikiDetailDTO getById(Long id);
    int add(WikiEntity entity);
    int update(WikiEntity entity);
    int delete(Long id);

    // Segment operations
    int addSegment(WikiSegment segment);
    int updateSegment(WikiSegment segment);
    int deleteSegment(Long id);
    /** 查询实体的所有片段及其预计算向量（LEFT JOIN wiki_segment_embedding） */
    List<WikiSegmentEmbeddingDTO> listSegmentsWithEmbedding(Long entityId);

    // Rule operations
    int addRule(WikiRule rule);
    int updateRule(WikiRule rule);
    int deleteRule(Long id);

    // Relation operations
    int addRelation(WikiRelation relation);
    int updateRelation(WikiRelation relation);
    int deleteRelation(Long id);
}