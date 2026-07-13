package com.cdc.cdcbackend.mapper;
import com.cdc.cdcbackend.entity.CdcArticleTemplate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface CdcArticleTemplateMapper {
    // 查询所有
    List<CdcArticleTemplate> listAll();
    // 分页查询
    List<CdcArticleTemplate> listPaged(@Param("offset") int offset, @Param("limit") int limit);
    // 总数
    long count();
    // 根据ID查询详情
    CdcArticleTemplate getById(Long id);
    // 新增
    int insert(CdcArticleTemplate template);
    // 修改
    int update(CdcArticleTemplate template);
    // 删除
    int delete(Long id);
}