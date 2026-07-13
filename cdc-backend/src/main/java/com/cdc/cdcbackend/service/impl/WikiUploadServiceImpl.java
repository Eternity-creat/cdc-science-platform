package com.cdc.cdcbackend.service.impl;

import com.cdc.cdcbackend.dto.WikiUploadConfirmResultDTO;
import com.cdc.cdcbackend.dto.WikiUploadEntityDTO;
import com.cdc.cdcbackend.dto.WikiUploadPreviewDTO;
import com.cdc.cdcbackend.dto.WikiUploadRuleDTO;
import com.cdc.cdcbackend.dto.WikiUploadSegmentDTO;
import com.cdc.cdcbackend.entity.CdcUploadTask;
import com.cdc.cdcbackend.entity.WikiEntity;
import com.cdc.cdcbackend.entity.WikiRule;
import com.cdc.cdcbackend.entity.WikiSegment;
import com.cdc.cdcbackend.event.SegmentChangedEvent;
import com.cdc.cdcbackend.mapper.CdcUploadTaskMapper;
import com.cdc.cdcbackend.mapper.WikiEntityMapper;
import com.cdc.cdcbackend.mapper.WikiRelationMapper;
import com.cdc.cdcbackend.mapper.WikiRuleMapper;
import com.cdc.cdcbackend.mapper.WikiSegmentMapper;
import com.cdc.cdcbackend.service.WikiUploadService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class WikiUploadServiceImpl implements WikiUploadService {

    private static final int STATUS_PARSED = 1;
    private static final int STATUS_IMPORTED = 2;
    private static final int STATUS_FAILED = 3;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Resource private CdcUploadTaskMapper uploadTaskMapper;
    @Resource private WikiEntityMapper entityMapper;
    @Resource private WikiSegmentMapper segmentMapper;
    @Resource private WikiRuleMapper ruleMapper;
    @Resource private WikiRelationMapper relationMapper;
    @Resource private ApplicationEventPublisher eventPublisher;

    @Override
    public WikiUploadPreviewDTO uploadAndPreview(MultipartFile file, Integer entityType) {
        if (file == null || file.isEmpty()) {
            throw new RuntimeException("上传文件不能为空");
        }

        String fileName = cleanFileName(file.getOriginalFilename());
        String ext = extensionOf(fileName);
        if (!isSupported(ext)) {
            throw new RuntimeException("不支持的文件类型: " + ext + "，当前支持 json/md/txt/docx/pdf");
        }

        CdcUploadTask task = new CdcUploadTask();
        task.setFileName(fileName);
        task.setStatus(0);
        task.setCreateTime(LocalDateTime.now());

        try {
            Path uploadDir = Paths.get("uploads", "wiki");
            Files.createDirectories(uploadDir);
            Path target = uploadDir.resolve(UUID.randomUUID() + "." + ext);
            try (InputStream in = file.getInputStream()) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }

            task.setFilePath(target.toAbsolutePath().toString());
            task.setResultMsg(writeMeta(entityType, "uploaded"));
            uploadTaskMapper.insert(task);

            WikiUploadPreviewDTO preview = parseFile(target, fileName, ext, entityType);
            preview.setTaskId(task.getId());
            preview.setStatus(STATUS_PARSED);

            task.setStatus(STATUS_PARSED);
            task.setResultMsg(writeMeta(entityType, buildSummary(preview)));
            uploadTaskMapper.updateStatus(task);
            return preview;
        } catch (Exception e) {
            task.setStatus(STATUS_FAILED);
            task.setResultMsg(e.getMessage());
            if (task.getId() == null) {
                uploadTaskMapper.insert(task);
            } else {
                uploadTaskMapper.updateStatus(task);
            }
            throw new RuntimeException("Wiki 文件解析失败: " + e.getMessage(), e);
        }
    }

    @Override
    public WikiUploadPreviewDTO getPreview(Long taskId) {
        CdcUploadTask task = requireTask(taskId);
        String ext = extensionOf(task.getFileName());
        WikiUploadPreviewDTO preview = parseFile(Paths.get(task.getFilePath()), task.getFileName(), ext, readEntityType(task));
        preview.setTaskId(task.getId());
        preview.setStatus(task.getStatus());
        return preview;
    }

    @Override
    @Transactional
    public WikiUploadConfirmResultDTO confirm(Long taskId) {
        CdcUploadTask task = requireTask(taskId);
        if (task.getStatus() != null && task.getStatus() == STATUS_IMPORTED) {
            throw new RuntimeException("该上传任务已确认入库，请勿重复提交");
        }

        WikiUploadPreviewDTO preview = getPreview(taskId);
        WikiUploadConfirmResultDTO result = new WikiUploadConfirmResultDTO();
        result.setTaskId(taskId);
        result.setInsertedCount(0);
        result.setOverwrittenCount(0);
        result.setSegmentCount(0);
        result.setRuleCount(0);

        for (WikiUploadEntityDTO item : preview.getEntities()) {
            validateEntity(item);

            WikiEntity old = entityMapper.findByName(item.getStdName(), item.getEntityType());
            if (old != null) {
                deleteExistingEntity(old.getId());
                result.setOverwrittenCount(result.getOverwrittenCount() + 1);
                result.getOverwrittenNames().add(item.getStdName());
            } else {
                result.setInsertedCount(result.getInsertedCount() + 1);
            }

            WikiEntity entity = new WikiEntity();
            entity.setEntityType(item.getEntityType());
            entity.setStdName(item.getStdName());
            entity.setAlias(item.getAlias());
            entity.setSummary(item.getSummary());
            entityMapper.insert(entity);

            for (WikiUploadSegmentDTO segItem : item.getSegments()) {
                if (isBlank(segItem.getContent())) {
                    continue;
                }
                WikiSegment segment = new WikiSegment();
                segment.setEntityId(entity.getId());
                segment.setContent(segItem.getContent().trim());
                segment.setSource(isBlank(segItem.getSource()) ? task.getFileName() : segItem.getSource());
                segmentMapper.insert(segment);
                result.setSegmentCount(result.getSegmentCount() + 1);
                eventPublisher.publishEvent(new SegmentChangedEvent(
                        this, segment.getId(), entity.getId(), segment.getContent(), SegmentChangedEvent.ChangeType.CREATED));
            }

            for (WikiUploadRuleDTO ruleItem : item.getRules()) {
                if (isBlank(ruleItem.getContent())) {
                    continue;
                }
                WikiRule rule = new WikiRule();
                rule.setEntityId(entity.getId());
                rule.setRuleType(isBlank(ruleItem.getRuleType()) ? "FactRule" : ruleItem.getRuleType());
                rule.setContent(ruleItem.getContent().trim());
                rule.setStatus(1);
                ruleMapper.insert(rule);
                result.setRuleCount(result.getRuleCount() + 1);
            }
        }

        task.setStatus(STATUS_IMPORTED);
        task.setResultMsg(writeMeta(readEntityType(task), "imported: entities=" + preview.getEntityCount()));
        uploadTaskMapper.updateStatus(task);
        return result;
    }

    private WikiUploadPreviewDTO parseFile(Path path, String fileName, String ext, Integer defaultEntityType) {
        try {
            WikiUploadPreviewDTO preview;
            if ("json".equals(ext)) {
                preview = parseJson(Files.readString(path, StandardCharsets.UTF_8), defaultEntityType, fileName);
            } else {
                String text = extractText(path, ext);
                preview = parseText(text, defaultEntityType, fileName, ext);
            }
            preview.setFileName(fileName);
            preview.setFileType(ext);
            preview.setEntityCount(preview.getEntities().size());
            preview.setSegmentCount(preview.getEntities().stream().mapToInt(e -> e.getSegments().size()).sum());
            preview.setRuleCount(preview.getEntities().stream().mapToInt(e -> e.getRules().size()).sum());
            return preview;
        } catch (Exception e) {
            throw new RuntimeException("解析文件失败: " + e.getMessage(), e);
        }
    }

    private WikiUploadPreviewDTO parseJson(String json, Integer defaultEntityType, String fileName) throws IOException {
        JsonNode root = objectMapper.readTree(json);
        List<JsonNode> nodes = new ArrayList<>();
        if (root.isArray()) {
            root.forEach(nodes::add);
        } else if (root.has("entities") && root.get("entities").isArray()) {
            root.get("entities").forEach(nodes::add);
        } else {
            nodes.add(root);
        }

        WikiUploadPreviewDTO preview = new WikiUploadPreviewDTO();
        for (JsonNode node : nodes) {
            WikiUploadEntityDTO entity = parseJsonEntity(node, defaultEntityType, fileName);
            preview.getEntities().add(entity);
        }
        return preview;
    }

    private WikiUploadEntityDTO parseJsonEntity(JsonNode node, Integer defaultEntityType, String fileName) throws IOException {
        WikiUploadEntityDTO entity = new WikiUploadEntityDTO();
        entity.setEntityType(intValue(node, defaultEntityType, "entityType", "entity_type", "type"));
        entity.setStdName(textValue(node, "stdName", "std_name", "name", "title"));
        entity.setAlias(aliasValue(node.get("alias")));
        entity.setSummary(textValue(node, "summary", "intro", "description"));

        addJsonSegments(entity, node.get("segments"), fileName);
        addJsonSegments(entity, node.get("wikiSegments"), fileName);
        addJsonSegments(entity, node.get("wiki_segments"), fileName);
        addJsonSegments(entity, node.get("authoritativeSegments"), fileName);
        addJsonSegments(entity, node.get("fragments"), fileName);

        addJsonRules(entity, node.get("rules"));
        addRuleArray(entity, node.get("mustInclude"), "MustInclude");
        addRuleArray(entity, node.get("must_include"), "MustInclude");
        addRuleArray(entity, node.get("mustNotSay"), "MustNotSay");
        addRuleArray(entity, node.get("must_not_say"), "MustNotSay");

        if (entity.getSegments().isEmpty() && !isBlank(entity.getSummary())) {
            WikiUploadSegmentDTO segment = new WikiUploadSegmentDTO();
            segment.setContent(entity.getSummary());
            segment.setSource(fileName);
            entity.getSegments().add(segment);
        }
        return entity;
    }

    private WikiUploadPreviewDTO parseText(String text, Integer entityType, String fileName, String ext) {
        WikiUploadPreviewDTO preview = new WikiUploadPreviewDTO();
        WikiUploadEntityDTO entity = new WikiUploadEntityDTO();
        entity.setEntityType(entityType == null ? 1 : entityType);
        entity.setStdName(resolveTitle(text, fileName));

        List<String> paragraphs = normalizedParagraphs(text);
        for (String p : paragraphs) {
            WikiUploadRuleDTO rule = parseRuleLine(p);
            if (rule != null) {
                entity.getRules().add(rule);
            }
        }

        String plainText = removeRuleLines(text).trim();
        entity.setSummary(firstSummary(plainText));
        for (String chunk : splitSegments(plainText)) {
            WikiUploadSegmentDTO segment = new WikiUploadSegmentDTO();
            segment.setContent(chunk);
            segment.setSource(fileName + ":" + ext);
            entity.getSegments().add(segment);
        }
        preview.getEntities().add(entity);
        return preview;
    }

    private String extractText(Path path, String ext) throws IOException {
        if ("txt".equals(ext) || "md".equals(ext)) {
            return Files.readString(path, StandardCharsets.UTF_8);
        }
        if ("docx".equals(ext)) {
            try (InputStream in = Files.newInputStream(path); XWPFDocument doc = new XWPFDocument(in)) {
                StringBuilder sb = new StringBuilder();
                for (XWPFParagraph paragraph : doc.getParagraphs()) {
                    String text = paragraph.getText();
                    if (!isBlank(text)) {
                        sb.append(text).append("\n\n");
                    }
                }
                return sb.toString();
            }
        }
        if ("pdf".equals(ext)) {
            try (PDDocument doc = Loader.loadPDF(path.toFile())) {
                return new PDFTextStripper().getText(doc);
            }
        }
        throw new RuntimeException("不支持的文件类型: " + ext);
    }

    private void addJsonSegments(WikiUploadEntityDTO entity, JsonNode node, String fileName) {
        if (node == null || !node.isArray()) {
            return;
        }
        for (JsonNode item : node) {
            WikiUploadSegmentDTO segment = new WikiUploadSegmentDTO();
            if (item.isTextual()) {
                segment.setContent(item.asText());
                segment.setSource(fileName);
            } else {
                segment.setContent(textValue(item, "content", "text"));
                segment.setSource(textValue(item, "source", "来源"));
            }
            if (!isBlank(segment.getContent())) {
                entity.getSegments().add(segment);
            }
        }
    }

    private void addJsonRules(WikiUploadEntityDTO entity, JsonNode node) {
        if (node == null || !node.isArray()) {
            return;
        }
        for (JsonNode item : node) {
            WikiUploadRuleDTO rule = new WikiUploadRuleDTO();
            if (item.isTextual()) {
                rule.setRuleType("FactRule");
                rule.setContent(item.asText());
            } else {
                rule.setRuleType(textValue(item, "ruleType", "rule_type", "type"));
                rule.setContent(textValue(item, "content", "text"));
            }
            if (!isBlank(rule.getContent())) {
                entity.getRules().add(rule);
            }
        }
    }

    private void addRuleArray(WikiUploadEntityDTO entity, JsonNode node, String ruleType) {
        if (node == null || !node.isArray()) {
            return;
        }
        for (JsonNode item : node) {
            String content = item.isTextual() ? item.asText() : textValue(item, "content", "text");
            if (!isBlank(content)) {
                WikiUploadRuleDTO rule = new WikiUploadRuleDTO();
                rule.setRuleType(ruleType);
                rule.setContent(content);
                entity.getRules().add(rule);
            }
        }
    }

    private WikiUploadRuleDTO parseRuleLine(String line) {
        String trimmed = line.trim();
        Map<String, String> prefixes = new HashMap<>();
        prefixes.put("MustInclude:", "MustInclude");
        prefixes.put("MustInclude：", "MustInclude");
        prefixes.put("必须包含:", "MustInclude");
        prefixes.put("必须包含：", "MustInclude");
        prefixes.put("MustNotSay:", "MustNotSay");
        prefixes.put("MustNotSay：", "MustNotSay");
        prefixes.put("禁止表述:", "MustNotSay");
        prefixes.put("禁止表述：", "MustNotSay");
        prefixes.put("不能说:", "MustNotSay");
        prefixes.put("不能说：", "MustNotSay");

        for (Map.Entry<String, String> entry : prefixes.entrySet()) {
            if (trimmed.startsWith(entry.getKey())) {
                WikiUploadRuleDTO rule = new WikiUploadRuleDTO();
                rule.setRuleType(entry.getValue());
                rule.setContent(trimmed.substring(entry.getKey().length()).trim());
                return isBlank(rule.getContent()) ? null : rule;
            }
        }
        return null;
    }

    private List<String> splitSegments(String text) {
        List<String> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String p : normalizedParagraphs(text)) {
            if (p.startsWith("#")) {
                continue;
            }
            if (parseRuleLine(p) != null) {
                continue;
            }
            if (current.length() + p.length() > 900 && current.length() > 0) {
                chunks.add(current.toString().trim());
                current.setLength(0);
            }
            current.append(p).append("\n\n");
        }
        if (current.length() > 0) {
            chunks.add(current.toString().trim());
        }
        return chunks;
    }

    private List<String> normalizedParagraphs(String text) {
        String normalized = text == null ? "" : text.replace("\r\n", "\n").replace("\r", "\n");
        String[] parts = normalized.split("\\n\\s*\\n|\\n(?=#{1,6}\\s)");
        List<String> paragraphs = new ArrayList<>();
        for (String part : parts) {
            String p = part.trim();
            if (!p.isEmpty()) {
                paragraphs.add(p);
            }
        }
        return paragraphs;
    }

    private String removeRuleLines(String text) {
        StringBuilder sb = new StringBuilder();
        for (String line : (text == null ? "" : text).split("\\R")) {
            if (parseRuleLine(line) == null) {
                sb.append(line).append("\n");
            }
        }
        return sb.toString();
    }

    private String resolveTitle(String text, String fileName) {
        for (String line : (text == null ? "" : text).split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("# ")) {
                return trimmed.substring(2).trim();
            }
        }
        return baseName(fileName);
    }

    private String firstSummary(String text) {
        for (String p : normalizedParagraphs(text)) {
            if (!p.startsWith("#") && parseRuleLine(p) == null) {
                return p.length() > 500 ? p.substring(0, 500) : p;
            }
        }
        return "";
    }

    private void validateEntity(WikiUploadEntityDTO item) {
        if (item.getEntityType() == null) {
            throw new RuntimeException("缺少 entityType: " + item.getStdName());
        }
        if (isBlank(item.getStdName())) {
            throw new RuntimeException("缺少 stdName");
        }
    }

    private void deleteExistingEntity(Long entityId) {
        List<WikiSegment> oldSegments = segmentMapper.listByEntityId(entityId);
        for (WikiSegment segment : oldSegments) {
            eventPublisher.publishEvent(new SegmentChangedEvent(
                    this, segment.getId(), entityId, null, SegmentChangedEvent.ChangeType.DELETED));
        }
        segmentMapper.deleteByEntityId(entityId);
        ruleMapper.deleteByEntityId(entityId);
        relationMapper.deleteByFromEid(entityId);
        relationMapper.deleteByToEid(entityId);
        entityMapper.delete(entityId);
    }

    private CdcUploadTask requireTask(Long taskId) {
        CdcUploadTask task = uploadTaskMapper.getById(taskId);
        if (task == null) {
            throw new RuntimeException("上传任务不存在: " + taskId);
        }
        if (isBlank(task.getFilePath()) || !Files.exists(Paths.get(task.getFilePath()))) {
            throw new RuntimeException("上传文件不存在或已被删除: " + taskId);
        }
        return task;
    }

    private String writeMeta(Integer entityType, String message) {
        try {
            Map<String, Object> meta = new HashMap<>();
            meta.put("entityType", entityType);
            meta.put("message", message);
            return objectMapper.writeValueAsString(meta);
        } catch (Exception e) {
            return message;
        }
    }

    private Integer readEntityType(CdcUploadTask task) {
        try {
            JsonNode root = objectMapper.readTree(task.getResultMsg());
            JsonNode node = root.get("entityType");
            return node == null || node.isNull() ? 1 : node.asInt(1);
        } catch (Exception e) {
            return 1;
        }
    }

    private String buildSummary(WikiUploadPreviewDTO preview) {
        return "parsed: entities=" + preview.getEntityCount()
                + ", segments=" + preview.getSegmentCount()
                + ", rules=" + preview.getRuleCount();
    }

    private String textValue(JsonNode node, String... names) {
        if (node == null) {
            return null;
        }
        for (String name : names) {
            JsonNode value = node.get(name);
            if (value != null && !value.isNull()) {
                return value.isTextual() ? value.asText() : value.toString();
            }
        }
        return null;
    }

    private Integer intValue(JsonNode node, Integer defaultValue, String... names) {
        for (String name : names) {
            JsonNode value = node.get(name);
            if (value != null && value.canConvertToInt()) {
                return value.asInt();
            }
        }
        return defaultValue == null ? 1 : defaultValue;
    }

    private String aliasValue(JsonNode node) throws IOException {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isTextual()) {
            return node.asText();
        }
        return objectMapper.writeValueAsString(node);
    }

    private String cleanFileName(String original) {
        String fileName = original == null || original.isBlank() ? "wiki-upload" : original;
        return Paths.get(fileName).getFileName().toString();
    }

    private String extensionOf(String fileName) {
        int idx = fileName == null ? -1 : fileName.lastIndexOf('.');
        return idx < 0 ? "" : fileName.substring(idx + 1).toLowerCase(Locale.ROOT);
    }

    private String baseName(String fileName) {
        String clean = cleanFileName(fileName);
        int idx = clean.lastIndexOf('.');
        return idx < 0 ? clean : clean.substring(0, idx);
    }

    private boolean isSupported(String ext) {
        return "json".equals(ext) || "md".equals(ext) || "txt".equals(ext)
                || "docx".equals(ext) || "pdf".equals(ext);
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
