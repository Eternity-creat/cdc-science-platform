package com.cdc.cdcbackend.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class WikiUploadPreviewDTO {
    private Long taskId;
    private String fileName;
    private String fileType;
    private Integer status;
    private Integer entityCount;
    private Integer segmentCount;
    private Integer ruleCount;
    private List<String> warnings = new ArrayList<>();
    private List<WikiUploadEntityDTO> entities = new ArrayList<>();
}
