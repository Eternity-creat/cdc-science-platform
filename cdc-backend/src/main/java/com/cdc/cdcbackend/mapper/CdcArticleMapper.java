package com.cdc.cdcbackend.mapper;
import com.cdc.cdcbackend.dto.ArticleListItemDTO;
import com.cdc.cdcbackend.entity.CdcArticle;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface CdcArticleMapper {
    int insert(CdcArticle article);
    CdcArticle getById(Long id);
    int updateOutline(CdcArticle article);
    int updateInitialDraft(CdcArticle article);
    int updateFinalArticle(CdcArticle article);
    int autoSaveOutline(CdcArticle article);
    int autoSaveDraft(CdcArticle article);
    int autoSaveFinal(CdcArticle article);
    int updateGenerationMeta(CdcArticle article);
    List<ArticleListItemDTO> listAll();
    List<ArticleListItemDTO> listPaged(@Param("offset") int offset, @Param("limit") int limit,
                                        @Param("status") Integer status, @Param("keyword") String keyword);
    long count(@Param("status") Integer status, @Param("keyword") String keyword);
    int deleteById(Long id);
}