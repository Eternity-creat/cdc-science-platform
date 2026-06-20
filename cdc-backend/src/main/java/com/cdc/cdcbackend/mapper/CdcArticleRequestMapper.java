package com.cdc.cdcbackend.mapper;

import com.cdc.cdcbackend.entity.CdcArticleRequest;
import org.apache.ibatis.annotations.Mapper;
import java.util.List;

@Mapper
public interface CdcArticleRequestMapper {

    // 插入生成记录
    int insert(CdcArticleRequest request);

    // 根据ID查询
    CdcArticleRequest getById(Long id);

    // 查询所有记录
    List<CdcArticleRequest> listAll();

    // BUG-NEW-12 fix: 删除文章时级联清理请求记录
    int deleteById(Long id);
}