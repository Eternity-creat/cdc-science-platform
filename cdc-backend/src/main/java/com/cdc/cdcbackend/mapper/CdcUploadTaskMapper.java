package com.cdc.cdcbackend.mapper;
import com.cdc.cdcbackend.entity.CdcUploadTask;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CdcUploadTaskMapper {
    int insert(CdcUploadTask task);
    CdcUploadTask getById(Long id);
    int updateStatus(CdcUploadTask task);
}
