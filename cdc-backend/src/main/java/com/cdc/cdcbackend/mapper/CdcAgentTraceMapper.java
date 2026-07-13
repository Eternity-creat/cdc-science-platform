package com.cdc.cdcbackend.mapper;

import com.cdc.cdcbackend.entity.CdcAgentTrace;
import org.apache.ibatis.annotations.Mapper;
import java.util.List;

@Mapper
public interface CdcAgentTraceMapper {

    int insert(CdcAgentTrace trace);

    // 加上这个方法
    List<CdcAgentTrace> listByArticleId(Long articleId);

    int deleteByArticleId(Long articleId);
}