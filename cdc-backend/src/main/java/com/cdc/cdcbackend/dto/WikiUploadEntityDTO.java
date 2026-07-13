package com.cdc.cdcbackend.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class WikiUploadEntityDTO {
    private Integer entityType;
    private String stdName;
    private String alias;
    private String summary;
    private List<WikiUploadSegmentDTO> segments = new ArrayList<>();
    private List<WikiUploadRuleDTO> rules = new ArrayList<>();
}
