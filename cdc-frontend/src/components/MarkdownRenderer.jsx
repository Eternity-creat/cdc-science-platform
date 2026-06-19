import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '../lib/utils.js';
import CitationBadge from './CitationBadge.jsx';

/**
 * 将 React children 中的 {ref:N} 文本片段替换为 CitationBadge 组件。
 * 支持纯字符串和嵌套 React 元素（如 <strong>、<em> 等）。
 */
function processCitations(children, segments) {
  if (!segments || segments.length === 0) return children;

  const regex = /\{ref:(\d+)\}/g;
  let keyCounter = 0;

  const walk = (node) => {
    if (typeof node === 'string') {
      const parts = [];
      let lastIndex = 0;
      let match;
      regex.lastIndex = 0;

      while ((match = regex.exec(node)) !== null) {
        if (match.index > lastIndex) {
          parts.push(node.slice(lastIndex, match.index));
        }
        parts.push(
          <CitationBadge
            key={`cite-${keyCounter++}`}
            index={parseInt(match[1], 10)}
            segments={segments}
          />
        );
        lastIndex = match.index + match[0].length;
      }

      if (parts.length === 0) return node;
      if (lastIndex < node.length) {
        parts.push(node.slice(lastIndex));
      }
      return parts.length === 1 ? parts[0] : parts;
    }

    if (Array.isArray(node)) {
      return node.map(walk);
    }

    if (node && typeof node === 'object' && node.props && node.props.children) {
      const newChildren = walk(node.props.children);
      if (newChildren === node.props.children) return node;
      return { ...node, props: { ...node.props, children: newChildren } };
    }

    return node;
  };

  return walk(children);
}

/**
 * 预处理 Agent 生成的内容：
 * 1. 将字面 \n 转换为真正的换行符
 * 2. 将字面 \t 转换为制表符
 * 3. 规范化非标准编号格式 (n1. → 1.)
 * 4. 确保 Markdown 语法可被正确解析
 */
function preprocessContent(raw) {
  if (!raw) return '';

  let text = raw;

  // 1. 转换字面转义序列为真实字符
  text = text.replace(/\\n/g, '\n');
  text = text.replace(/\\t/g, '\t');
  text = text.replace(/\\r/g, '');

  // 2. 规范化 Agent 输出的非标准编号
  //    "n1." → "1."  "n 1." → "1."  （行首或换行后）
  text = text.replace(/(^|\n)\s*n\s*(\d+)\./g, '$1$2.');

  // 3. 将中文编号标题转换为 Markdown 标题
  //    "一、xxx" → "## 一、xxx"  (仅在没有已有 # 前缀时)
  const cnNums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  cnNums.forEach(num => {
    // "一、" or "一." at start of line without existing # prefix
    const pattern = new RegExp(`(^|\\n)(?!(#))(${num}[、.．])`, 'g');
    text = text.replace(pattern, '$1## $3');
  });

  // 4. 确保连续换行不超过两个（避免大段空白）
  text = text.replace(/\n{4,}/g, '\n\n\n');

  // 5. 清理行首多余空格（保留列表缩进）
  text = text.replace(/\n[ \t]+(?=[^\s\d#*\->])/g, '\n');

  // 6. 去除 Agent 输出中包裹整篇内容或单行的多余引号
  //    例如 "  # 标题  " → # 标题
  text = text.replace(/(^|\n)[""'「『【]\s*(?=#)/g, '$1');
  text = text.replace(/[""'」』】"]\s*$/g, '');

  return text.trim();
}

/**
 * Markdown 渲染组件
 * @param {string} content - 原始 Markdown 文本
 * @param {string} mode - 'outline' 大纲模式 | 'article' 文章模式（默认）
 */
export default function MarkdownRenderer({ content, mode = 'article', className, segments }) {
  const processed = useMemo(() => preprocessContent(content), [content]);

  if (!processed) return null;

  // 大纲模式：只渲染标题层级
  if (mode === 'outline') {
    return (
      <div className={cn('prose-cdc', className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            h1: ({ children }) => (
              <div className="flex items-center gap-2 mt-6 first:mt-0 mb-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <h1 className="text-lg font-semibold tracking-tight text-foreground">
                  {children}
                </h1>
              </div>
            ),
            h2: ({ children }) => (
              <div className="flex items-center gap-2 ml-4 mt-3 mb-1">
                <div className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <h2 className="text-sm font-medium text-foreground/80">
                  {children}
                </h2>
              </div>
            ),
            h3: ({ children }) => (
              <div className="flex items-center gap-2 ml-8 mt-2 mb-1">
                <h3 className="text-[13px] text-muted-foreground">
                  {children}
                </h3>
              </div>
            ),
            // 大纲模式下隐藏正文段落，只展示结构
            p: ({ children }) => {
              const text = String(children).trim();
              if (!text) return null;
              return (
                <p className="text-sm leading-relaxed text-foreground/75 mb-2 ml-2">
                  {children}
                </p>
              );
            },
            ol: ({ children }) => (
              <ol className="list-decimal pl-5 mb-2 space-y-0.5 text-sm text-foreground/75">
                {children}
              </ol>
            ),
            ul: ({ children }) => (
              <ul className="list-disc pl-5 mb-2 space-y-0.5 text-sm text-foreground/75">
                {children}
              </ul>
            ),
            li: ({ children }) => (
              <li className="leading-relaxed">{children}</li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-foreground">{children}</strong>
            ),
            hr: () => <hr className="border-border my-3" />,
          }}
        >
          {processed}
        </ReactMarkdown>
      </div>
    );
  }

  // 文章模式：完整渲染
  return (
    <div className={cn('prose-cdc', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-[1.5rem] font-semibold tracking-tight text-foreground mb-3 mt-8 first:mt-0 pb-2 border-b border-border/50">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold tracking-tight text-foreground mb-2 mt-6">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-foreground mb-2 mt-4">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold text-foreground mb-1.5 mt-3">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="text-[14px] leading-7 text-foreground/85 mb-3">
              {processCitations(children, segments)}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground/90">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 mb-3 space-y-1.5 text-[14px] leading-7 text-foreground/85">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 mb-3 space-y-1.5 text-[14px] leading-7 text-foreground/85">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-7">{processCitations(children, segments)}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-primary/40 pl-4 py-1 my-4 text-muted-foreground italic bg-accent/30 rounded-r-[var(--radius-sm)]">
              {children}
            </blockquote>
          ),
          code: ({ className: codeClass, children }) => {
            const isBlock = codeClass?.includes('language-');
            if (isBlock) {
              return (
                <pre className="bg-accent/50 rounded-[var(--radius-md)] p-3 my-3 overflow-x-auto">
                  <code className="text-xs font-mono text-foreground">{children}</code>
                </pre>
              );
            }
            return (
              <code className="bg-accent/50 px-1.5 py-0.5 rounded text-xs font-mono text-primary">
                {children}
              </code>
            );
          },
          hr: () => <hr className="border-border my-5" />,
          a: ({ href, children }) => (
            <a href={href} className="text-primary underline underline-offset-2 hover:opacity-80" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="min-w-full text-sm border-collapse border border-border">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-primary/5">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border border-border px-3 py-1.5 text-left font-medium text-foreground">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-1.5 text-foreground/85">{children}</td>
          ),
          del: ({ children }) => (
            <del className="text-muted-foreground line-through">{children}</del>
          ),
          img: ({ src, alt }) => {
            // Resolve img:// protocol if present
            const resolvedSrc = src?.startsWith('img://') ? src.slice(6) : src;
            return (
              <img
                src={resolvedSrc}
                alt={alt || ''}
                className="max-w-full rounded-[var(--radius-md)] my-3"
                loading="lazy"
              />
            );
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
