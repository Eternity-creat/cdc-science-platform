-- V2: Article workflow enhancements
-- 1. Add operation_type to cdc_article_modification
-- 2. Add generating status tracking (optional)

-- Add operation_type column
ALTER TABLE cdc_article_modification
  ADD COLUMN operation_type VARCHAR(30) DEFAULT 'manual_edit'
  AFTER modify_type;

-- Update existing records
UPDATE cdc_article_modification
SET operation_type = 'manual_edit'
WHERE operation_type IS NULL;

-- Optional: add generating flag to cdc_article
-- ALTER TABLE cdc_article ADD COLUMN generating TINYINT(1) DEFAULT 0;
