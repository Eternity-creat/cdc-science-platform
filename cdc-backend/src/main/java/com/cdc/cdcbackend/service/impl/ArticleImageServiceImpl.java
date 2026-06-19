package com.cdc.cdcbackend.service.impl;
import com.cdc.cdcbackend.entity.CdcArticleImage;
import com.cdc.cdcbackend.mapper.CdcArticleImageMapper;
import com.cdc.cdcbackend.service.ArticleImageService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class ArticleImageServiceImpl implements ArticleImageService {
    @Resource
    private CdcArticleImageMapper imageMapper;

    @Override
    public List<CdcArticleImage> listByArticleId(Long articleId) {
        return imageMapper.listByArticleId(articleId);
    }

    @Override
    public CdcArticleImage getById(Long id) {
        return imageMapper.getById(id);
    }

    @Override
    public CdcArticleImage save(CdcArticleImage image) {
        if (image.getStatus() == null) image.setStatus(1);
        if (image.getImageKey() == null) {
            image.setImageKey(generateImageKey(image.getArticleId()));
        }
        imageMapper.insert(image);
        return image;
    }

    @Override
    public int update(CdcArticleImage image) {
        return imageMapper.update(image);
    }

    @Override
    public int delete(Long id) {
        return imageMapper.delete(id);
    }

    @Override
    public int deleteByArticleId(Long articleId) {
        return imageMapper.deleteByArticleId(articleId);
    }

    @Override
    public String generateImageKey(Long articleId) {
        List<CdcArticleImage> existing = imageMapper.listByArticleId(articleId);
        int nextNum = existing.size() + 1;
        return String.format("img_%03d", nextNum);
    }
}
