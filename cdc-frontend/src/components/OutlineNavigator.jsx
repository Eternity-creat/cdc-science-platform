import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { extractMarkdownHeadings } from '../lib/content.js';
import { ScrollArea } from './ui/scroll-area.jsx';

export default function OutlineNavigator({
  content,
  scrollRootRef,
  title = '大纲目录',
  className,
  maxDepth = 3,
}) {
  const headings = useMemo(() => extractMarkdownHeadings(content, maxDepth), [content, maxDepth]);
  const [activeId, setActiveId] = useState(headings[0]?.id || '');
  const isClickScrollingRef = useRef(false);

  useEffect(() => {
    setActiveId(headings[0]?.id || '');
  }, [headings]);

  useEffect(() => {
    const root = scrollRootRef?.current?.querySelector('[data-radix-scroll-area-viewport]') || scrollRootRef?.current || null;
    if (!root || headings.length === 0) return undefined;

    const getElements = () => headings
      .map((heading) => root.querySelector(`#${CSS.escape(heading.id)}`))
      .filter(Boolean);

    const elements = getElements();
    if (elements.length === 0) return undefined;

    const updateActiveFromScroll = () => {
      if (isClickScrollingRef.current) return;
      const rootTop = root.getBoundingClientRect().top;
      const candidates = getElements()
        .map((element) => ({
          id: element.id,
          distance: element.getBoundingClientRect().top - rootTop,
        }))
        .filter((item) => item.distance <= 96)
        .sort((a, b) => b.distance - a.distance);

      if (candidates[0]?.id) {
        setActiveId(candidates[0].id);
      } else {
        const firstBelow = getElements()
          .map((element) => ({
            id: element.id,
            distance: element.getBoundingClientRect().top - rootTop,
          }))
          .filter((item) => item.distance > 0)
          .sort((a, b) => a.distance - b.distance)[0];
        if (firstBelow?.id) setActiveId(firstBelow.id);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (isClickScrollingRef.current) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
      },
      {
        root,
        rootMargin: '0px 0px -65% 0px',
        threshold: [0, 1],
      }
    );

    elements.forEach((element) => observer.observe(element));
    root.addEventListener('scroll', updateActiveFromScroll, { passive: true });
    updateActiveFromScroll();

    return () => {
      observer.disconnect();
      root.removeEventListener('scroll', updateActiveFromScroll);
    };
  }, [headings, scrollRootRef]);

  const handleJump = (id) => {
    const root = scrollRootRef?.current?.querySelector('[data-radix-scroll-area-viewport]') || scrollRootRef?.current;
    const target = root?.querySelector(`#${CSS.escape(id)}`);
    if (!root || !target) return;

    const rootRect = root.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = root.scrollTop + targetRect.top - rootRect.top - 24;

    isClickScrollingRef.current = true;
    root.scrollTo({
      top: Math.max(0, top),
      behavior: 'smooth',
    });
    setActiveId(id);
    window.setTimeout(() => {
      isClickScrollingRef.current = false;
      setActiveId(id);
    }, 500);
  };

  return (
    <aside className={cn('flex h-full flex-col overflow-hidden border-r bg-background/70', className)}>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <FileText size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      <ScrollArea className="flex-1 py-2">
        {headings.length > 0 ? (
          <div className="space-y-0.5 px-2">
            {headings.map((heading) => (
              <button
                key={heading.id}
                type="button"
                className={cn(
                  'block w-full rounded-[var(--radius-sm)] py-1.5 pr-2 text-left text-xs leading-snug transition-colors',
                  heading.level === 1 && 'pl-2 font-semibold',
                  heading.level === 2 && 'pl-5 text-muted-foreground',
                  heading.level >= 3 && 'pl-8 text-muted-foreground/85',
                  activeId === heading.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-accent hover:text-foreground'
                )}
                onClick={() => handleJump(heading.id)}
                title={heading.title}
              >
                <span className="line-clamp-2">{heading.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            暂无可定位标题
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}
