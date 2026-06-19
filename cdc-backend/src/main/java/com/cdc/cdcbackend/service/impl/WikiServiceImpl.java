package com.cdc.cdcbackend.service.impl;
import com.cdc.cdcbackend.common.PageResult;
import com.cdc.cdcbackend.dto.WikiDetailDTO;
import com.cdc.cdcbackend.dto.WikiRuleDTO;
import com.cdc.cdcbackend.dto.WikiSegmentDTO;
import com.cdc.cdcbackend.dto.WikiSegmentEmbeddingDTO;
import com.cdc.cdcbackend.entity.WikiEntity;
import com.cdc.cdcbackend.entity.WikiRelation;
import com.cdc.cdcbackend.entity.WikiRule;
import com.cdc.cdcbackend.entity.WikiSegment;
import com.cdc.cdcbackend.mapper.*;
import com.cdc.cdcbackend.event.SegmentChangedEvent;
import com.cdc.cdcbackend.service.WikiService;
import jakarta.annotation.Resource;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class WikiServiceImpl implements WikiService {

    @Resource private WikiEntityMapper entityMapper;
    @Resource private WikiSegmentMapper segmentMapper;
    @Resource private WikiRuleMapper ruleMapper;
    @Resource private WikiRelationMapper relationMapper;
    @Resource private ApplicationEventPublisher eventPublisher;

    @Override
    public List<WikiDetailDTO> listAll() {
        return entityMapper.listAll().stream().map(this::convert).collect(Collectors.toList());
    }

    @Override
    public PageResult<WikiDetailDTO> listPaged(int page, int size, Integer type, String keyword) {
        int offset = (page - 1) * size;
        long total = entityMapper.count(type, keyword);
        List<WikiEntity> entities = entityMapper.listPaged(offset, size, type, keyword);
        List<WikiDetailDTO> list = entities.stream().map(this::convert).collect(Collectors.toList());
        return PageResult.of(list, total, page, size);
    }

    @Override
    public WikiDetailDTO getById(Long id) {
        return convert(entityMapper.getById(id));
    }

    @Override
    public int add(WikiEntity entity) {
        return entityMapper.insert(entity);
    }

    @Override
    public int update(WikiEntity entity) {
        return entityMapper.update(entity);
    }

    @Override
    @Transactional
    public int delete(Long id) {
        segmentMapper.deleteByEntityId(id);
        ruleMapper.deleteByEntityId(id);
        relationMapper.deleteByFromEid(id);
        return entityMapper.delete(id);
    }

    // ==================== Segment CRUD ====================
    @Override
    @Transactional
    public int addSegment(WikiSegment segment) {
        int rows = segmentMapper.insert(segment);
        if (rows > 0) {
            eventPublisher.publishEvent(new SegmentChangedEvent(
                this, segment.getId(), segment.getEntityId(),
                segment.getContent(), SegmentChangedEvent.ChangeType.CREATED
            ));
        }
        return rows;
    }

    @Override
    @Transactional
    public int updateSegment(WikiSegment segment) {
        int rows = segmentMapper.update(segment);
        if (rows > 0) {
            eventPublisher.publishEvent(new SegmentChangedEvent(
                this, segment.getId(), segment.getEntityId(),
                segment.getContent(), SegmentChangedEvent.ChangeType.UPDATED
            ));
        }
        return rows;
    }

    @Override
    @Transactional
    public int deleteSegment(Long id) {
        int rows = segmentMapper.delete(id);
        if (rows > 0) {
            eventPublisher.publishEvent(new SegmentChangedEvent(
                this, id, null, null, SegmentChangedEvent.ChangeType.DELETED
            ));
        }
        return rows;
    }

    @Override
    public List<WikiSegmentEmbeddingDTO> listSegmentsWithEmbedding(Long entityId) {
        return segmentMapper.listWithEmbeddingByEntityId(entityId);
    }

    // ==================== Rule CRUD ====================
    @Override
    public int addRule(WikiRule rule) {
        return ruleMapper.insert(rule);
    }

    @Override
    public int updateRule(WikiRule rule) {
        return ruleMapper.update(rule);
    }

    @Override
    @Transactional
    public int deleteRule(Long id) {
        return ruleMapper.delete(id);
    }

    // ==================== Relation CRUD ====================
    @Override
    public int addRelation(WikiRelation relation) {
        return relationMapper.insert(relation);
    }

    @Override
    public int updateRelation(WikiRelation relation) {
        return relationMapper.update(relation);
    }

    @Override
    @Transactional
    public int deleteRelation(Long id) {
        return relationMapper.delete(id);
    }

    private WikiDetailDTO convert(WikiEntity e) {
        WikiDetailDTO dto = new WikiDetailDTO();
        dto.setId(e.getId());
        dto.setEntityType(e.getEntityType());
        dto.setStdName(e.getStdName());
        dto.setAlias(e.getAlias());
        dto.setSummary(e.getSummary());

        List<WikiSegmentDTO> segmentDTOs = segmentMapper.listByEntityId(e.getId()).stream().map(s -> {
            WikiSegmentDTO segDto = new WikiSegmentDTO();
            segDto.setId(s.getId());
            segDto.setEntityId(s.getEntityId());
            segDto.setContent(s.getContent());
            segDto.setSource(s.getSource());
            return segDto;
        }).collect(Collectors.toList());
        
        dto.setSegments(segmentDTOs);
        dto.setRules(ruleMapper.listByEntityId(e.getId()).stream().map(r -> {
            WikiRuleDTO ruleDto = new WikiRuleDTO();
            ruleDto.setId(r.getId());
            ruleDto.setRuleType(r.getRuleType());
            ruleDto.setContent(r.getContent());
            return ruleDto;
        }).collect(Collectors.toList()));
        dto.setRelatedIds(relationMapper.listByFromEid(e.getId()).stream().map(r->r.getToEid()).collect(Collectors.toList()));
        return dto;
    }
}
