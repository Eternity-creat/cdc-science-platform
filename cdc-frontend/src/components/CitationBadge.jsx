import { useState } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip.jsx';

/**
 * CitationBadge - 行内知识引用标签
 *
 * 在文章正文中渲染 {ref:N} 为绿色 "原文" 小标签，
 * hover 时弹出 Tooltip 显示对应知识片段内容和来源。
 *
 * Props:
 *   index    - 引用编号（从 1 开始，对应 [知识N]）
 *   segments - 知识片段数组 [{ id, content, source }]
 */
export default function CitationBadge({ index, segments }) {
  const seg = segments && segments[index - 1];

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="citation-badge">原文</span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          sideOffset={6}
          className="citation-tooltip max-w-xs"
        >
          {seg ? (
            <>
              <p className="text-[11px] leading-relaxed mb-1.5">{seg.content}</p>
              {seg.source && (
                <p className="text-[10px] opacity-50 border-t border-border/30 pt-1.5 mt-1">
                  {seg.source}
                </p>
              )}
            </>
          ) : (
            <p className="text-[11px] opacity-50">知识片段 #{index}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
