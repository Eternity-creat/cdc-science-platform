package com.cdc.cdcbackend.service.impl;

import com.cdc.cdcbackend.entity.CdcArticleRequest;
import com.cdc.cdcbackend.mapper.CdcArticleRequestMapper;
import com.cdc.cdcbackend.service.CdcArticleRequestService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class CdcArticleRequestServiceImpl implements CdcArticleRequestService {

    @Resource
    private CdcArticleRequestMapper requestMapper;

    @Override
    public int saveRequest(CdcArticleRequest request) {
        return requestMapper.insert(request);
    }

    @Override
    public CdcArticleRequest getById(Long id) {
        return requestMapper.getById(id);
    }

    @Override
    public List<CdcArticleRequest> listAll() {
        return requestMapper.listAll();
    }
}