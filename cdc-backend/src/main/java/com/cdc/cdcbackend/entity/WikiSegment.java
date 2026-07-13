package com.cdc.cdcbackend.entity;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class WikiSegment {
    private Long id;
    private Long entityId;
    private String content;
    private String source;
    private LocalDateTime createTime;
}