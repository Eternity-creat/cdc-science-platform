import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip.jsx';

/**
 * CitationBadge - 行内知识引用标签
 *
 * 在文章正文中渲染 {ref:N} 为带图标的引用标签，
 * hover 时弹出 Tooltip 显示对应知识片段内容和来源。
 */
function QuoteIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="citation-icon">
      <path d="M3.5 3C1.57 3 0 4.57 0 6.5c0 1.63 1.12 3 2.63 3.38-.13.88-.63 1.75-1.38 2.37a.5.5 0 00.63.78C3.38 11.88 4.5 10.13 4.5 8V6.5A1.5 1.5 0 003 5h-.5a.5.5 0 010-1H3c.28 0 .5.22.5.5zM10.5 3C8.57 3 7 4.57 7 6.5c0 1.63 1.12 3 2.63 3.38-.13.88-.63 1.75-1.38 2.37a.5.5 0 00.63.78C10.38 11.88 11.5 10.13 11.5 8V6.5A1.5 1.5 0 0010 5h-.5a.5.5 0 010-1H10c.28 0 .5.22.5.5z"/>
    </svg>
  );
}

export default function CitationBadge({ index, segments }) {
  const seg = segments && segments[index - 1];

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="citation-badge">
            <QuoteIcon />
            <span>原文</span>
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          sideOffset={8}
          className="citation-tooltip"
        >
          {seg ? (
            <>
              {seg.source && (
                <div className="citation-source">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" opacity="0.6">
                    <path d="M2 2h12a1 1 0 011 1v10a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1zm0 1v10h12V3H2zm2 2h8v1H4V5zm0 3h6v1H4V8z"/>
                  </svg>
                  <span>{seg.source}</span>
                </div>
              )}
              <p className="citation-content">{seg.content}</p>
            </>
          ) : (
            <p className="citation-fallback">知识片段 #{index}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
