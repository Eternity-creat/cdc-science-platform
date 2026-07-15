import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '../lib/utils.js';
import {
  buildHeadingId,
  normalizeImageSrc,
  normalizeMarkdown,
  parseImageAlt,
  plainTextFromReactChildren,
} from '../lib/content.js';
import CitationBadge from './CitationBadge.jsx';

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
        if (match.index > lastIndex) parts.push(node.slice(lastIndex, match.index));
        parts.push(
          <CitationBadge
            key={`cite-${keyCounter++}`}
            index={Number.parseInt(match[1], 10)}
            segments={segments}
          />
        );
        lastIndex = match.index + match[0].length;
      }

      if (parts.length === 0) return node;
      if (lastIndex < node.length) parts.push(node.slice(lastIndex));
      return parts;
    }

    if (Array.isArray(node)) return node.map(walk);

    if (node && typeof node === 'object' && node.props?.children) {
      return {
        ...node,
        props: {
          ...node.props,
          children: walk(node.props.children),
        },
      };
    }

    return node;
  };

  return walk(children);
}

function unwrapImageParagraph(children) {
  const items = React.Children.toArray(children);
  if (items.length !== 1) return null;
  const only = items[0];
  if (only?.props?.className?.includes('md-image-figure')) return only;
  return null;
}

export default function MarkdownRenderer({ content, mode = 'article', className, segments }) {
  const processed = useMemo(() => normalizeMarkdown(content), [content]);
  const headingId = (children, node) =>
    buildHeadingId(plainTextFromReactChildren(children), node?.position?.start?.line);

  if (!processed) return null;

  const headingClass = 'scroll-mt-20';

  const components = {
    h1: ({ children, node }) => {
      const id = headingId(children, node);
      return (
        <h1 id={id} className={cn(headingClass, 'text-[1.5rem] font-semibold text-foreground mb-3 mt-8 first:mt-0 pb-2 border-b border-border/50')}>
          {children}
        </h1>
      );
    },
    h2: ({ children, node }) => {
      const id = headingId(children, node);
      return (
        <h2 id={id} className={cn(headingClass, 'text-xl font-semibold text-foreground mb-2 mt-6')}>
          {children}
        </h2>
      );
    },
    h3: ({ children, node }) => {
      const id = headingId(children, node);
      return (
        <h3 id={id} className={cn(headingClass, 'text-base font-semibold text-foreground mb-2 mt-4')}>
          {children}
        </h3>
      );
    },
    h4: ({ children, node }) => {
      const id = headingId(children, node);
      return (
        <h4 id={id} className={cn(headingClass, 'text-sm font-semibold text-foreground mb-1.5 mt-3')}>
          {children}
        </h4>
      );
    },
    p: ({ children }) => {
      const image = unwrapImageParagraph(children);
      if (image) return image;
      return (
        <p className="text-[14px] leading-7 text-foreground/85 mb-3">
          {processCitations(children, segments)}
        </p>
      );
    },
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    em: ({ children }) => <em className="italic text-foreground/90">{children}</em>,
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
    li: ({ children, className }) => (
      <li className={cn('leading-7', className?.includes('task-list-item') && 'list-none -ml-5')}>
        {processCitations(children, segments)}
      </li>
    ),
    input: (props) => (
      <input
        {...props}
        className="mr-2 h-3.5 w-3.5 rounded border-border align-[-2px] accent-primary"
        readOnly
      />
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-primary/40 pl-4 py-2 my-4 text-muted-foreground bg-accent/30 rounded-r-[var(--radius-sm)]">
        {children}
      </blockquote>
    ),
    pre: ({ children }) => (
      <pre className="bg-accent/50 rounded-[var(--radius-md)] p-3 my-3 overflow-x-auto">
        {children}
      </pre>
    ),
    code: ({ inline, className: codeClass, children, ...props }) => {
      if (inline) {
        return (
          <code className="bg-accent/60 px-1.5 py-0.5 rounded text-xs font-mono text-primary" {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className={cn('text-xs font-mono text-foreground', codeClass)} {...props}>
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
      <div className="overflow-x-auto my-4 rounded-[var(--radius-md)] border border-border">
        <table className="min-w-full text-sm border-collapse">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-primary/5">{children}</thead>,
    th: ({ children }) => <th className="border-b border-border px-3 py-2 text-left font-semibold text-foreground">{children}</th>,
    td: ({ children }) => <td className="border-t border-border px-3 py-2 text-foreground/85">{children}</td>,
    del: ({ children }) => <del className="text-muted-foreground line-through">{children}</del>,
    img: ({ src, alt }) => {
      const meta = parseImageAlt(alt);
      const resolvedSrc = normalizeImageSrc(src);
      const width = `${meta.width}px`;

      return (
        <figure
          className={cn(
            'md-image-figure my-5 flex flex-col gap-2',
            meta.align === 'center' ? 'items-center text-center' : 'items-start text-left'
          )}
        >
          <img
            src={resolvedSrc}
            alt={meta.caption}
            loading="lazy"
            decoding="async"
            className="md-image max-h-[520px] w-auto max-w-full rounded-[var(--radius-md)] border border-border object-contain shadow-[var(--shadow-card)]"
            style={{ maxWidth: width }}
          />
          {meta.showCaption && meta.caption && (
            <figcaption className="max-w-[min(100%,720px)] text-xs leading-relaxed text-muted-foreground">
              {meta.caption}
            </figcaption>
          )}
        </figure>
      );
    },
  };

  if (mode === 'outline') {
    return (
      <div className={cn('prose-cdc prose-cdc-outline', className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            ...components,
            h1: ({ children }) => (
              <div className="flex items-center gap-2 mt-6 first:mt-0 mb-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <h1 className="text-lg font-semibold text-foreground">{children}</h1>
              </div>
            ),
            h2: ({ children }) => (
              <div className="flex items-center gap-2 ml-4 mt-3 mb-1">
                <div className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <h2 className="text-sm font-medium text-foreground/80">{children}</h2>
              </div>
            ),
            h3: ({ children }) => (
              <div className="flex items-center gap-2 ml-8 mt-2 mb-1">
                <span className="text-[13px] text-muted-foreground">{children}</span>
              </div>
            ),
            p: ({ children }) => {
              const text = plainTextFromReactChildren(children).trim();
              if (!text) return null;
              return <p className="text-sm leading-relaxed text-foreground/75 mb-2 ml-2">{children}</p>;
            },
          }}
        >
          {processed}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className={cn('prose-cdc', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {processed}
      </ReactMarkdown>
    </div>
  );
}
