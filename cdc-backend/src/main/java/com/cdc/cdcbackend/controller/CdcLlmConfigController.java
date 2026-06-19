package com.cdc.cdcbackend.controller;
import com.cdc.cdcbackend.common.Result;
import com.cdc.cdcbackend.entity.CdcLlmConfig;
import com.cdc.cdcbackend.service.CdcLlmConfigService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/llm-config")
public class CdcLlmConfigController {

    @Resource
    private CdcLlmConfigService configService;

    @GetMapping
    public Result<List<CdcLlmConfig>> listAll() {
        return Result.success(configService.listAll());
    }

    @GetMapping("/type/{configType}")
    public Result<List<CdcLlmConfig>> listByType(@PathVariable String configType) {
        return Result.success(configService.listByType(configType));
    }

    @GetMapping("/{id}")
    public Result<CdcLlmConfig> getById(@PathVariable Long id) {
        return Result.success(configService.getById(id));
    }

    @GetMapping("/default/{configType}")
    public Result<CdcLlmConfig> getDefault(@PathVariable String configType) {
        return Result.success(configService.getDefaultByType(configType));
    }

    @PostMapping
    public Result<CdcLlmConfig> add(@RequestBody CdcLlmConfig config) {
        return Result.success(configService.add(config));
    }

    @PutMapping("/{id}")
    public Result<Integer> update(@PathVariable Long id, @RequestBody CdcLlmConfig config) {
        config.setId(id);
        return Result.success(configService.update(config));
    }

    @DeleteMapping("/{id}")
    public Result<Integer> delete(@PathVariable Long id) {
        return Result.success(configService.delete(id));
    }

    @PutMapping("/{id}/set-default")
    public Result<Integer> setDefault(@PathVariable Long id) {
        return Result.success(configService.setAsDefault(id));
    }
}
