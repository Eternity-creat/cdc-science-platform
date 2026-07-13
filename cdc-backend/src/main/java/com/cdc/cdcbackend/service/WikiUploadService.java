package com.cdc.cdcbackend.service;

import com.cdc.cdcbackend.dto.WikiUploadConfirmResultDTO;
import com.cdc.cdcbackend.dto.WikiUploadPreviewDTO;
import org.springframework.web.multipart.MultipartFile;

public interface WikiUploadService {
    WikiUploadPreviewDTO uploadAndPreview(MultipartFile file, Integer entityType);
    WikiUploadPreviewDTO getPreview(Long taskId);
    WikiUploadConfirmResultDTO confirm(Long taskId);
}
