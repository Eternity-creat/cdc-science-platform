package com.cdc.cdcbackend.entity;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class CdcUploadTask {
    private Long id;
    private String fileName;
    private String filePath;
    private Integer status;
    private String resultMsg;
    private LocalDateTime createTime;
}