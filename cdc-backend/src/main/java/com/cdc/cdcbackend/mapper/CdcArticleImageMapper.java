package com.cdc.cdcbackend.mapper;
import com.cdc.cdcbackend.entity.CdcArticleImage;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface CdcArticleImageMapper {
    List<CdcArticleImage> listByArticleId(@Param("articleId") Long articleId);
    CdcArticleImage getById(@Param("id") Long id);
    CdcArticleImage getByKey(@Param("articleId") Long articleId, @Param("imageKey") String imageKey);
    int insert(CdcArticleImage image);
    int update(CdcArticleImage image);
    int delete(@Param("id") Long id);
    int deleteByArticleId(@Param("articleId") Long articleId);
}
