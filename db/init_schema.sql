/*
 CDC 科普文章生成平台 — 数据库表结构（仅结构，不含数据）



*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for cdc_agent_feedback
-- ----------------------------
DROP TABLE IF EXISTS `cdc_agent_feedback`;
CREATE TABLE `cdc_agent_feedback`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `article_id` bigint NOT NULL COMMENT '文章 ID',
  `section_index` int NULL DEFAULT NULL COMMENT '段落索引',
  `original_text` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT 'AI 生成原文',
  `edited_text` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '用户修改后的文本',
  `edit_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '修改类型: rewrite/delete/add/format',
  `auto_summary` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '自动生成的修改摘要',
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_article_id`(`article_id` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '用户编辑反馈闭环' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for cdc_agent_trace
-- ----------------------------
DROP TABLE IF EXISTS `cdc_agent_trace`;
CREATE TABLE `cdc_agent_trace`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `article_id` bigint NULL DEFAULT NULL,
  `step_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `step_content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT 'JSON',
  `cost_time` int NULL DEFAULT NULL COMMENT '??',
  `create_time` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  `model_used` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '使用的模型名称',
  `token_usage` json NULL COMMENT 'token 用量 {prompt,completion,total}',
  `quality_metrics` json NULL COMMENT '质量指标',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_trace_article`(`article_id` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for cdc_article
-- ----------------------------
DROP TABLE IF EXISTS `cdc_article`;
CREATE TABLE `cdc_article`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `request_id` bigint NULL DEFAULT NULL,
  `template_id` bigint NULL DEFAULT NULL,
  `outline` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `initial_draft` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `final_article` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `status` int NULL DEFAULT NULL COMMENT '1???,2?????,3?????,4???',
  `create_time` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `cover_image` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '封面图 URL/OSS 路径',
  `images` json NULL COMMENT '配图列表 [{id,url,caption,position,generated_by}]',
  `quality_score` decimal(3, 2) NULL DEFAULT NULL COMMENT 'AI 自评分 (0-1)',
  `readability_level` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '可读性等级',
  `generation_meta` json NULL COMMENT '生成元数据 {model,total_tokens,total_cost_ms,retry_count}',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for cdc_article_image
-- ----------------------------
DROP TABLE IF EXISTS `cdc_article_image`;
CREATE TABLE `cdc_article_image`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `article_id` bigint NOT NULL COMMENT '所属文章 ID',
  `image_key` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '图片唯一标识 (img_001)',
  `file_path` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT 'OSS/本地存储路径',
  `caption` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '图片说明',
  `position` int NULL DEFAULT 0 COMMENT '在文章中的段落位置',
  `generated_by` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '生成模型 (SenseNova U1 Lite)',
  `generation_prompt` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '生成时使用的 prompt',
  `width` int NULL DEFAULT NULL,
  `height` int NULL DEFAULT NULL,
  `file_size` bigint NULL DEFAULT NULL COMMENT '文件大小 (bytes)',
  `status` tinyint NULL DEFAULT 1 COMMENT '1=正常 0=已删除',
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_article_id`(`article_id` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '文章配图管理' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for cdc_article_modification
-- ----------------------------
DROP TABLE IF EXISTS `cdc_article_modification`;
CREATE TABLE `cdc_article_modification`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `article_id` bigint NULL DEFAULT NULL,
  `modify_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT 'outline/initial_draft',
  `operation_type` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT 'manual_edit',
  `before_content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `after_content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `modify_time` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_mod_article`(`article_id` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for cdc_article_request
-- ----------------------------
DROP TABLE IF EXISTS `cdc_article_request`;
CREATE TABLE `cdc_article_request`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mode` int NULL DEFAULT NULL COMMENT '1??,2????',
  `entity_type` int NULL DEFAULT NULL COMMENT '1??,2??',
  `entity_id` bigint NULL DEFAULT NULL,
  `population_id` bigint NULL DEFAULT NULL,
  `scene_id` bigint NULL DEFAULT NULL,
  `template_id` bigint NULL DEFAULT NULL,
  `word_count` int NULL DEFAULT NULL,
  `user_text` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `create_time` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  `population_name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `scene_name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `entity_name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for cdc_article_template
-- ----------------------------
DROP TABLE IF EXISTS `cdc_article_template`;
CREATE TABLE `cdc_article_template`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `template_name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `tag` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `purpose` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `tone` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT 'JSON?????',
  `outline_structure` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT 'JSON?????',
  `status` int NULL DEFAULT 1,
  `create_time` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_template_status`(`status` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for cdc_embedding_cache
-- ----------------------------
DROP TABLE IF EXISTS `cdc_embedding_cache`;
CREATE TABLE `cdc_embedding_cache`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `content_hash` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '内容哈希',
  `embedding` json NOT NULL COMMENT '向量',
  `model_version` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '模型版本',
  `source_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '来源类型: segment/query/other',
  `source_id` bigint NULL DEFAULT NULL COMMENT '来源 ID',
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_content_model`(`content_hash` ASC, `model_version` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '通用 Embedding 缓存' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for cdc_llm_config
-- ----------------------------
DROP TABLE IF EXISTS `cdc_llm_config`;
CREATE TABLE `cdc_llm_config`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `config_name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '配置显示名称',
  `config_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '类型: text_generation/fact_check/rule_check/intent_parse/reflect_iterate/embedding/image_generation',
  `provider` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'dashscope' COMMENT '模型提供商',
  `model_name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '模型标识',
  `api_key_encrypted` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '加密后的 API Key',
  `base_url` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '自定义 API 端点',
  `params` json NULL COMMENT '模型参数 {temperature,max_tokens,top_p,...}',
  `is_default` tinyint NULL DEFAULT 0 COMMENT '是否为该类型的默认配置',
  `is_enabled` tinyint NULL DEFAULT 1 COMMENT '是否启用',
  `description` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_type_default`(`config_type` ASC, `is_default` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = 'LLM 统一配置管理' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for cdc_upload_task
-- ----------------------------
DROP TABLE IF EXISTS `cdc_upload_task`;
CREATE TABLE `cdc_upload_task`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `file_path` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `status` int NULL DEFAULT 0,
  `result_msg` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `create_time` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for wiki_entity
-- ----------------------------
DROP TABLE IF EXISTS `wiki_entity`;
CREATE TABLE `wiki_entity`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `entity_type` int NULL DEFAULT NULL COMMENT '1疾病；2疫苗；3人群；4场景',
  `std_name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `alias` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT 'JSON',
  `summary` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `create_time` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_entity_type`(`entity_type` ASC) USING BTREE,
  INDEX `idx_std_name`(`std_name` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for wiki_relation
-- ----------------------------
DROP TABLE IF EXISTS `wiki_relation`;
CREATE TABLE `wiki_relation`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `from_eid` bigint NULL DEFAULT NULL,
  `to_eid` bigint NULL DEFAULT NULL,
  `rel_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `create_time` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_relation_from`(`from_eid` ASC) USING BTREE,
  INDEX `idx_relation_to`(`to_eid` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for wiki_rule
-- ----------------------------
DROP TABLE IF EXISTS `wiki_rule`;
CREATE TABLE `wiki_rule`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `entity_id` bigint NULL DEFAULT NULL,
  `rule_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT 'MustInclude/MustNotSay/FactRule',
  `content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `apply_entity_ids` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT 'JSON??',
  `status` int NULL DEFAULT 1,
  `create_time` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_rule_entity`(`entity_id` ASC) USING BTREE,
  INDEX `idx_rule_type`(`rule_type` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for wiki_segment
-- ----------------------------
DROP TABLE IF EXISTS `wiki_segment`;
CREATE TABLE `wiki_segment`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `entity_id` bigint NULL DEFAULT NULL,
  `content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '????',
  `source` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `create_time` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  `embedding` json NULL COMMENT '向量缓存 (1536维 float32 数组)',
  `embedding_model` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '生成 embedding 的模型版本号',
  `embedding_updated_at` datetime NULL DEFAULT NULL COMMENT 'embedding 最后更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_segment_entity`(`entity_id` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for wiki_segment_embedding
-- ----------------------------
DROP TABLE IF EXISTS `wiki_segment_embedding`;
CREATE TABLE `wiki_segment_embedding`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `segment_id` bigint NOT NULL COMMENT '关联片段 ID',
  `entity_id` bigint NOT NULL COMMENT '所属实体 ID',
  `content_hash` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '内容 SHA256 哈希',
  `embedding` json NOT NULL COMMENT '向量数组',
  `model_version` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '模型版本',
  `dimensions` int NULL DEFAULT 1536 COMMENT '向量维度',
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_segment_id`(`segment_id` ASC) USING BTREE,
  INDEX `idx_entity_id`(`entity_id` ASC) USING BTREE,
  INDEX `idx_content_hash`(`content_hash` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '片段向量持久化表' ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
