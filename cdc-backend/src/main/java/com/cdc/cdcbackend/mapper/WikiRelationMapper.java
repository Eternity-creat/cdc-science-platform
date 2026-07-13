package com.cdc.cdcbackend.mapper;
import com.cdc.cdcbackend.entity.WikiRelation;
import org.apache.ibatis.annotations.Mapper;
import java.util.List;

@Mapper
public interface WikiRelationMapper {
    List<WikiRelation> listByFromEid(Long fromEid);
    int insert(WikiRelation relation);
    int update(WikiRelation relation);
    int delete(Long id);
    int deleteByFromEid(Long fromEid);
    int deleteByToEid(Long toEid);
}
