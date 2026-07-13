-- ============================================================================
-- Phase 1 Optimization Migration (Idempotent)
-- Version:  V3__optimization_phase1.sql
-- Date:     2026-06-15
--
-- 幂等脚本：重复执行不会报错，已存在的列/索引会自动跳过
-- ============================================================================

DELIMITER $$

-- 辅助存储过程：安全添加列（列已存在则跳过）
DROP PROCEDURE IF EXISTS safe_add_column$$
CREATE PROCEDURE safe_add_column(
    IN p_table    VARCHAR(64),
    IN p_column   VARCHAR(64),
    IN p_definition TEXT
)
BEGIN
    DECLARE col_exists INT DEFAULT 0;
    SELECT COUNT(*) INTO col_exists
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND COLUMN_NAME  = p_column;

    IF col_exists = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

-- 辅助存储过程：安全创建索引（索引已存在则跳过）
DROP PROCEDURE IF EXISTS safe_add_index$$
CREATE PROCEDURE safe_add_index(
    IN p_table  VARCHAR(64),
    IN p_index  VARCHAR(64),
    IN p_columns VARCHAR(256)
)
BEGIN
    DECLARE idx_exists INT DEFAULT 0;
    SELECT COUNT(*) INTO idx_exists
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND INDEX_NAME   = p_index;

    IF idx_exists = 0 THEN
        SET @ddl = CONCAT('CREATE INDEX `', p_index, '` ON `', p_table, '`(', p_columns, ')');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

DELIMITER ;

-- ============================================================================
-- SECTION 1: ALTER EXISTING TABLES
-- ============================================================================

-- 1.1 wiki_segment
CALL safe_add_column('wiki_segment', 'embedding',            "JSON        DEFAULT NULL COMMENT '向量缓存 (1536维 float32 数组)'");
CALL safe_add_column('wiki_segment', 'embedding_model',      "VARCHAR(64) DEFAULT NULL COMMENT '生成 embedding 的模型版本号'");
CALL safe_add_column('wiki_segment', 'embedding_updated_at', "DATETIME    DEFAULT NULL COMMENT 'embedding 最后更新时间'");
CALL safe_add_index('wiki_segment', 'idx_segment_entity', 'entity_id');

-- 1.2 cdc_article
CALL safe_add_column('cdc_article', 'cover_image',       "VARCHAR(512) DEFAULT NULL COMMENT '封面图 URL/OSS 路径'");
CALL safe_add_column('cdc_article', 'images',            "JSON         DEFAULT NULL COMMENT '配图列表 [{id,url,caption,position,generated_by}]'");
CALL safe_add_column('cdc_article', 'quality_score',     "DECIMAL(3,2) DEFAULT NULL COMMENT 'AI 自评分 (0-1)'");
CALL safe_add_column('cdc_article', 'readability_level', "VARCHAR(20)  DEFAULT NULL COMMENT '可读性等级'");
CALL safe_add_column('cdc_article', 'generation_meta',   "JSON         DEFAULT NULL COMMENT '生成元数据 {model,total_tokens,total_cost_ms,retry_count}'");

-- 1.3 cdc_agent_trace
CALL safe_add_column('cdc_agent_trace', 'model_used',      "VARCHAR(64) DEFAULT NULL COMMENT '使用的模型名称'");
CALL safe_add_column('cdc_agent_trace', 'token_usage',     "JSON        DEFAULT NULL COMMENT 'token 用量 {prompt,completion,total}'");
CALL safe_add_column('cdc_agent_trace', 'quality_metrics', "JSON        DEFAULT NULL COMMENT '质量指标'");

-- 1.4 wiki_rule
CALL safe_add_column('wiki_rule', 'entity_id', "BIGINT DEFAULT NULL COMMENT '关联实体 ID'");
CALL safe_add_index('wiki_rule', 'idx_rule_entity', 'entity_id');

-- 1.5 cdc_article_request
CALL safe_add_column('cdc_article_request', 'population_name', "VARCHAR(64) DEFAULT NULL");
CALL safe_add_column('cdc_article_request', 'scene_name',      "VARCHAR(64) DEFAULT NULL");
CALL safe_add_column('cdc_article_request', 'entity_name',     "VARCHAR(64) DEFAULT NULL");


-- ============================================================================
-- SECTION 2: CREATE NEW TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS wiki_segment_embedding (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    segment_id      BIGINT      NOT NULL COMMENT '关联片段 ID',
    entity_id       BIGINT      NOT NULL COMMENT '所属实体 ID',
    content_hash    VARCHAR(64) NOT NULL COMMENT '内容 SHA256 哈希',
    embedding       JSON        NOT NULL COMMENT '向量数组',
    model_version   VARCHAR(64) NOT NULL COMMENT '模型版本',
    dimensions      INT         DEFAULT 1536 COMMENT '向量维度',
    created_at      DATETIME    DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_segment_id (segment_id),
    INDEX idx_entity_id (entity_id),
    INDEX idx_content_hash (content_hash)
) COMMENT '片段向量持久化表';

CREATE TABLE IF NOT EXISTS cdc_article_image (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    article_id      BIGINT      NOT NULL COMMENT '所属文章 ID',
    image_key       VARCHAR(128) NOT NULL COMMENT '图片唯一标识 (img_001)',
    file_path       VARCHAR(512) NOT NULL COMMENT 'OSS/本地存储路径',
    caption         VARCHAR(256) DEFAULT NULL COMMENT '图片说明',
    position        INT         DEFAULT 0    COMMENT '在文章中的段落位置',
    generated_by    VARCHAR(64) DEFAULT NULL COMMENT '生成模型 (SenseNova U1 Lite)',
    generation_prompt TEXT       DEFAULT NULL COMMENT '生成时使用的 prompt',
    width           INT         DEFAULT NULL,
    height          INT         DEFAULT NULL,
    file_size       BIGINT      DEFAULT NULL COMMENT '文件大小 (bytes)',
    status          TINYINT     DEFAULT 1    COMMENT '1=正常 0=已删除',
    created_at      DATETIME    DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_article_id (article_id)
) COMMENT '文章配图管理';

CREATE TABLE IF NOT EXISTS cdc_agent_feedback (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    article_id      BIGINT      NOT NULL COMMENT '文章 ID',
    section_index   INT         DEFAULT NULL COMMENT '段落索引',
    original_text   TEXT                     COMMENT 'AI 生成原文',
    edited_text     TEXT                     COMMENT '用户修改后的文本',
    edit_type       VARCHAR(32) DEFAULT NULL COMMENT '修改类型: rewrite/delete/add/format',
    auto_summary    VARCHAR(512) DEFAULT NULL COMMENT '自动生成的修改摘要',
    created_at      DATETIME    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_article_id (article_id)
) COMMENT '用户编辑反馈闭环';

CREATE TABLE IF NOT EXISTS cdc_embedding_cache (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    content_hash    VARCHAR(64) NOT NULL COMMENT '内容哈希',
    embedding       JSON        NOT NULL COMMENT '向量',
    model_version   VARCHAR(64) NOT NULL COMMENT '模型版本',
    source_type     VARCHAR(32) DEFAULT NULL COMMENT '来源类型: segment/query/other',
    source_id       BIGINT      DEFAULT NULL COMMENT '来源 ID',
    created_at      DATETIME    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_content_model (content_hash, model_version)
) COMMENT '通用 Embedding 缓存';

CREATE TABLE IF NOT EXISTS cdc_llm_config (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    config_name     VARCHAR(64)  NOT NULL COMMENT '配置显示名称',
    config_type     VARCHAR(32)  NOT NULL COMMENT '类型: text_generation/fact_check/rule_check/intent_parse/reflect_iterate/embedding/image_generation',
    provider        VARCHAR(32)  NOT NULL DEFAULT 'dashscope' COMMENT '模型提供商',
    model_name      VARCHAR(64)  NOT NULL COMMENT '模型标识',
    api_key_encrypted VARCHAR(512) DEFAULT NULL COMMENT '加密后的 API Key',
    base_url        VARCHAR(256) DEFAULT NULL COMMENT '自定义 API 端点',
    params          JSON         DEFAULT NULL COMMENT '模型参数 {temperature,max_tokens,top_p,...}',
    is_default      TINYINT      DEFAULT 0    COMMENT '是否为该类型的默认配置',
    is_enabled      TINYINT      DEFAULT 1    COMMENT '是否启用',
    description     VARCHAR(256) DEFAULT NULL,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_type_default (config_type, is_default)
) COMMENT 'LLM 统一配置管理';


-- ============================================================================
-- 清理辅助存储过程
-- ============================================================================
DROP PROCEDURE IF EXISTS safe_add_column;
DROP PROCEDURE IF EXISTS safe_add_index;

-- ============================================================================
-- END
-- ============================================================================
