export function normalizeLineBreaks(value) {
  if (value == null) return '';
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\u00a0/g, ' ');
}

export function normalizeMarkdown(value) {
  let text = normalizeLineBreaks(value);

  text = text.replace(/(^|\n)\s*n\s*(\d+)\./g, '$1$2.');
  text = text.replace(/\n{4,}/g, '\n\n\n');
  text = text.replace(/\n[ \t]+(?=[^\s\d#*\->|])/g, '\n');
  text = text.replace(/(^|\n)[""'`[\]\s]*(?=#)/g, '$1');
  text = text.replace(/[""'`]\s*$/g, '');
  text = normalizeLooseHeadings(text);

  return text.trim();
}

function normalizeLooseHeadings(text) {
  const chineseHeadingPattern = /^[一二三四五六七八九十百]+[、.．]\s*.+$/;
  const bracketHeadingPattern = /^[（(][一二三四五六七八九十百]+[）)]\s*.+$/;

  return text
    .split('\n')
    .map((line, index, lines) => {
      const leading = line.match(/^\s*/)?.[0] || '';
      const raw = line.trim();
      const compact = raw.replace(/\s+/g, '');
      const bold = raw.match(/^\*\*(.+?)\*\*\s*$/);
      const title = (bold ? bold[1] : raw).trim();
      const isShortLine = title.length > 0 && title.length <= 48;
      const hasMarkdownPrefix = /^#{1,6}\s+/.test(raw);
      const isListLine = /^[-*+]\s+/.test(raw) || /^\d+[.)、]\s+/.test(raw);
      const nextLine = (lines[index + 1] || '').trim();
      const prevLine = (lines[index - 1] || '').trim();

      if (!raw || hasMarkdownPrefix || isListLine || !isShortLine) return line;

      if (chineseHeadingPattern.test(title)) {
        return `${leading}## ${title}`;
      }

      if (bracketHeadingPattern.test(title)) {
        return `${leading}### ${title}`;
      }

      if (
        index === 0 &&
        bold &&
        compact.length <= 36 &&
        nextLine === '' &&
        !/[。；;，,：:]$/.test(title)
      ) {
        return `${leading}# ${title}`;
      }

      if (
        bold &&
        prevLine === '' &&
        nextLine === '' &&
        compact.length <= 36 &&
        !/[。；;，,：:]$/.test(title)
      ) {
        return `${leading}## ${title}`;
      }

      return line;
    })
    .join('\n');
}

export function plainTextFromReactChildren(children) {
  if (children == null) return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(plainTextFromReactChildren).join('');
  if (children?.props?.children) return plainTextFromReactChildren(children.props.children);
  return '';
}

export function slugifyHeading(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'section';
}

export function buildHeadingId(title, lineNumber) {
  const slug = slugifyHeading(title);
  return lineNumber ? `${slug}-l${lineNumber}` : slug;
}

export function extractMarkdownHeadings(markdown, maxDepth = 3) {
  const text = normalizeMarkdown(markdown);

  return text
    .split('\n')
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.trim());
      if (!match) return null;
      const level = match[1].length;
      if (level > maxDepth) return null;

      const title = match[2].trim();

      return {
        id: buildHeadingId(title, index + 1),
        level,
        title,
      };
    })
    .filter(Boolean);
}

export function createHeadingIdFactory() {
  return (children) => {
    const title = plainTextFromReactChildren(children);
    return buildHeadingId(title);
  };
}

export function normalizeImageSrc(src) {
  if (!src) return '';
  const value = String(src).trim();
  if (!value) return '';
  if (value.startsWith('img://')) return normalizeImageSrc(value.slice(6));
  if (value.startsWith('/uploads/')) return value;
  if (value.startsWith('uploads/')) return `/${value}`;

  try {
    const url = new URL(value);
    if (url.pathname.startsWith('/uploads/')) return url.pathname;
  } catch {
    // Keep non-URL paths as-is below.
  }

  return value;
}

export function parseImageAlt(rawAlt) {
  const raw = String(rawAlt || '').trim();
  const result = {
    caption: raw,
    align: 'center',
    width: 720,
    showCaption: true,
  };

  const attrMatch = raw.match(/\{([^}]+)\}\s*$/);
  let text = raw;
  let attrText = '';

  if (attrMatch) {
    attrText = attrMatch[1];
    text = raw.slice(0, attrMatch.index).trim();
  } else if (raw.includes('|')) {
    const [caption, ...parts] = raw.split('|');
    text = caption.trim();
    attrText = parts.join(' ');
  }

  attrText.replace(/(\w+)\s*=\s*([^\s|]+)/g, (_, key, value) => {
    if (key === 'align' && ['left', 'center'].includes(value)) result.align = value;
    if (key === 'width') {
      const width = Number.parseInt(value, 10);
      if (Number.isFinite(width)) result.width = Math.min(Math.max(width, 240), 960);
    }
    if (key === 'caption' && ['0', 'false', 'none', 'hide'].includes(String(value).toLowerCase())) {
      result.showCaption = false;
    }
    return '';
  });

  result.caption = text || '配图';
  if (looksLikeImagePrompt(result.caption)) {
    result.caption = '配图';
    result.showCaption = false;
  }
  return result;
}

export function extractImagePromptMeta(prompt) {
  const value = String(prompt || '').replace(/\r\n/g, '\n').trim();
  if (!value) {
    return {
      topic: '',
      sectionTitle: '',
      sectionContent: '',
      requirement: '',
    };
  }

  const readField = (label) => {
    const match = value.match(new RegExp(`${label}[：:]\\s*([^\\n]+)`));
    return match ? match[1].trim() : '';
  };

  return {
    topic: readField('主题'),
    sectionTitle: readField('段落标题'),
    sectionContent: readField('段落内容'),
    requirement: readField('要求'),
  };
}

export function insertMarkdownAtSuggestedSection(content, markdown, image) {
  const source = String(content || '');
  const insert = String(markdown || '');
  const meta = extractImagePromptMeta(image?.generationPrompt || image?.prompt || '');
  const targetTitle = meta.sectionTitle || '';

  if (targetTitle) {
    const escaped = targetTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headingMatch = new RegExp(`(^|\\n)(#{1,6}\\s+.*${escaped}.*)(\\n|$)`).exec(source);
    if (headingMatch) {
      const lineEnd = headingMatch.index + headingMatch[0].length;
      const insertAt = headingMatch[0].endsWith('\n') ? lineEnd : lineEnd + 1;
      return {
        content: `${source.slice(0, insertAt)}${insert}${source.slice(insertAt)}`,
        matched: true,
        targetTitle,
      };
    }
  }

  return {
    content: source,
    matched: false,
    targetTitle,
  };
}

function looksLikeImagePrompt(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  const promptSignals = [
    '为健康科普文章生成',
    '生成一张配图',
    '段落标题',
    '段落内容',
    '要求：',
    '不包含文字',
    '健康科普风格',
    '专业医学插图风格',
  ];
  const signalCount = promptSignals.filter((signal) => value.includes(signal)).length;
  return value.length > 40 && signalCount >= 2;
}

export function buildImageMarkdown(image, options = {}) {
  const src = normalizeImageSrc(image?.filePath || image?.url || '');
  if (!src) return '';

  const align = ['left', 'center'].includes(options.align) ? options.align : 'center';
  const rawWidth = Number.parseInt(options.width ?? image?.width ?? 720, 10);
  const width = Number.isFinite(rawWidth) ? Math.min(Math.max(rawWidth, 240), 960) : 720;
  const alt = String(options.alt || '配图')
    .replace(/\|/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();

  return `\n\n![${alt || '配图'} {align=${align} width=${width} caption=false}](${src})\n\n`;
}

export async function compressImageFile(file, options = {}) {
  const {
    maxWidth = 1280,
    maxHeight = 1280,
    quality = 0.82,
    type = 'image/jpeg',
  } = options;

  if (!file || !file.type?.startsWith('image/')) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  if (scale >= 1 && file.size < 1024 * 1024) return file;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
    type,
    lastModified: Date.now(),
  });
}
