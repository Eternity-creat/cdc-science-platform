package com.cdc.cdcbackend.service;

import com.cdc.cdcbackend.entity.CdcArticleRequest;
import java.util.List;

public interface CdcArticleRequestService {
    int saveRequest(CdcArticleRequest request);
    CdcArticleRequest getById(Long id);
    List<CdcArticleRequest> listAll();
}