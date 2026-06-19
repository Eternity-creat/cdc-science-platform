package com.cdc.cdcbackend.dto;

import lombok.Data;

@Data
public class WikiSegmentDTO {
    private Long id;
    private Long entityId;
    private String content;
    private String source;
}
