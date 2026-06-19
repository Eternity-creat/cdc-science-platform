package com.cdc.cdcbackend.dto;
import com.cdc.cdcbackend.entity.WikiEntity;
import com.cdc.cdcbackend.entity.CdcArticleTemplate;
import lombok.Data;
import java.util.List;

@Data
public class ArticleFormDropDownDTO {
    private List<WikiEntity> diseaseList;     // 疾病
    private List<WikiEntity> vaccineList;     // 疫苗
    private List<WikiEntity> populationList;  // 人群
    private List<WikiEntity> sceneList;       // 场景
    private List<CdcArticleTemplate> templateList; // 模板（下拉用）
}