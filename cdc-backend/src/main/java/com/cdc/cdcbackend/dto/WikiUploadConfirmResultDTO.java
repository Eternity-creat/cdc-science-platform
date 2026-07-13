package com.cdc.cdcbackend.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class WikiUploadConfirmResultDTO {
    private Long taskId;
    private Integer insertedCount;
    private Integer overwrittenCount;
    private Integer segmentCount;
    private Integer ruleCount;
    private List<String> overwrittenNames = new ArrayList<>();
}
