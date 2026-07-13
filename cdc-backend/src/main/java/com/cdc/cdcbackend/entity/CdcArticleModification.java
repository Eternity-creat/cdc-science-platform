package com.cdc.cdcbackend.entity;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class CdcArticleModification {
    private Long id;
    private Long articleId;
    private String modifyType;       // outline / initial_draft / final_article
    private String operationType;    // manual_edit / ai_generate / ai_regenerate / revert
    private String beforeContent;
    private String afterContent;
    private LocalDateTime modifyTime;
}