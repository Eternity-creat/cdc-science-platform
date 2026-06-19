package com.cdc.cdcbackend.service.impl;
import com.cdc.cdcbackend.dto.ArticleFormDropDownDTO;
import com.cdc.cdcbackend.mapper.CdcArticleTemplateMapper;
import com.cdc.cdcbackend.mapper.WikiEntityMapper;
import com.cdc.cdcbackend.service.ArticleFormService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

@Service
public class ArticleFormServiceImpl implements ArticleFormService {

    @Resource
    private WikiEntityMapper wikiEntityMapper;

    @Resource
    private CdcArticleTemplateMapper templateMapper;

    @Override
    public ArticleFormDropDownDTO getFormDropDown() {
        ArticleFormDropDownDTO dto = new ArticleFormDropDownDTO();
        dto.setDiseaseList(wikiEntityMapper.listByType(1));
        dto.setVaccineList(wikiEntityMapper.listByType(2));
        dto.setPopulationList(wikiEntityMapper.listByType(3));
        dto.setSceneList(wikiEntityMapper.listByType(4));
        // 注入模板列表，前端下拉展示
        dto.setTemplateList(templateMapper.listAll());
        return dto;
    }
}