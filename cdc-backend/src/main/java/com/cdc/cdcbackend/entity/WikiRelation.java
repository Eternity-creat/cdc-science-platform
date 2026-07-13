package com.cdc.cdcbackend.entity;
import lombok.Data;

@Data
public class WikiRelation {
    private Long id;
    private Long fromEid;
    private Long toEid;
    private String relType;
}