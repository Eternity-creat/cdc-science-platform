package com.cdc.cdcbackend.service;
import com.cdc.cdcbackend.common.PageResult;
import com.cdc.cdcbackend.entity.CdcArticleTemplate;
import java.util.List;

public interface CdcArticleTemplateService {
    List<CdcArticleTemplate> list();
    PageResult<CdcArticleTemplate> listPaged(int page, int size);
    CdcArticleTemplate getById(Long id);
    int add(CdcArticleTemplate template);
    int update(CdcArticleTemplate template);
    int delete(Long id);
}