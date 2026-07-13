package com.cdc.cdcbackend.mapper;
import com.cdc.cdcbackend.entity.CdcArticleModification;
import org.apache.ibatis.annotations.Mapper;
import java.util.List;

@Mapper
public interface CdcArticleModificationMapper {
    int insert(CdcArticleModification dto);
    List<CdcArticleModification> listByArticleId(Long articleId);
    CdcArticleModification getById(Long id);
    int updateById(CdcArticleModification mod);  // BUG-NEW-5 fix: 支持 update 操作
    int deleteByArticleId(Long articleId);
}