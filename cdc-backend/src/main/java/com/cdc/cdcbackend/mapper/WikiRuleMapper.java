package com.cdc.cdcbackend.mapper;
import com.cdc.cdcbackend.entity.WikiRule;
import org.apache.ibatis.annotations.Mapper;
import java.util.List;

@Mapper
public interface WikiRuleMapper {
    List<WikiRule> listByEntityId(Long entityId);
    int insert(WikiRule rule);
    int update(WikiRule rule);
    int delete(Long id);
    int deleteByEntityId(Long entityId);
}