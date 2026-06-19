package com.cdc.cdcbackend.mapper;
import com.cdc.cdcbackend.entity.CdcArticleModification;
import org.apache.ibatis.annotations.Mapper;
import java.util.List;

@Mapper
public interface CdcArticleModificationMapper {
    int insert(CdcArticleModification dto);
    List<CdcArticleModification> listByArticleId(Long articleId);
    CdcArticleModification getById(Long id);
    int deleteByArticleId(Long articleId);
}