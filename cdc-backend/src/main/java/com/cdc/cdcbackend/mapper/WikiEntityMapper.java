package com.cdc.cdcbackend.mapper;
import com.cdc.cdcbackend.entity.WikiEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface WikiEntityMapper {
    List<WikiEntity> listAll();
    List<WikiEntity> listPaged(@Param("offset") int offset, @Param("limit") int limit,
                                @Param("type") Integer type, @Param("keyword") String keyword);
    long count(@Param("type") Integer type, @Param("keyword") String keyword);
    WikiEntity getById(Long id);
    int insert(WikiEntity entity);
    int update(WikiEntity entity);
    int delete(Long id);

    List<WikiEntity> listByType(@Param("type") Integer type);

    WikiEntity findByName(@Param("name") String name, @Param("type") Integer type);

    List<WikiEntity> fuzzySearch(@Param("name") String name, @Param("type") Integer type);
}
