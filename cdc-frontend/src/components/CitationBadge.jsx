import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip.jsx';

/**
 * CitationBadge - 行内知识引用标签
 *
 * 在文章正文中渲染 {ref:N} 为序号标签，
 * hover 时弹出 Tooltip 显示对应知识片段内容和来源。
 */
export default function CitationBadge({ index, segments }) {
  const seg = segments && segments[index - 1];

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="citation-badge">{index}</span>
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
