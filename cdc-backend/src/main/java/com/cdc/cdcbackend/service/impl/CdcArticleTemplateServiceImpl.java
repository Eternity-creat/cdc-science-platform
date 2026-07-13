package com.cdc.cdcbackend.service.impl;
import com.cdc.cdcbackend.common.PageResult;
import com.cdc.cdcbackend.entity.CdcArticleTemplate;
import com.cdc.cdcbackend.mapper.CdcArticleTemplateMapper;
import com.cdc.cdcbackend.service.CdcArticleTemplateService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class CdcArticleTemplateServiceImpl implements CdcArticleTemplateService {

    @Resource
    private CdcArticleTemplateMapper templateMapper;

    @Override
    public List<CdcArticleTemplate> list() {
        return templateMapper.listAll();
    }

    @Override
    public PageResult<CdcArticleTemplate> listPaged(int page, int size) {
        int offset = (page - 1) * size;
        long total = templateMapper.count();
        List<CdcArticleTemplate> list = templateMapper.listPaged(offset, size);
        return PageResult.of(list, total, page, size);
    }

    @Override
    public CdcArticleTemplate getById(Long id) {
        return templateMapper.getById(id);
    }

    @Override
    public int add(CdcArticleTemplate template) {
        return templateMapper.insert(template);
    }

    @Override
    public int update(CdcArticleTemplate template) {
        return templateMapper.update(template);
    }

    @Override
    public int delete(Long id) {
        return templateMapper.delete(id);
    }
}