package com.cdc.cdcbackend.service;
import com.cdc.cdcbackend.entity.CdcArticleImage;
import java.util.List;

public interface ArticleImageService {
    List<CdcArticleImage> listByArticleId(Long articleId);
    CdcArticleImage getById(Long id);
    CdcArticleImage save(CdcArticleImage image);
    int update(CdcArticleImage image);
    int delete(Long id);
    int deleteByArticleId(Long articleId);
    String generateImageKey(Long articleId);  // 生成下一个 img_xxx key
}
