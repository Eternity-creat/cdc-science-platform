import { useMemo, useState } from 'react';
import {
  CheckCircle2, Circle, Loader2, XCircle, SkipForward, Clock3,
  FileText, Gauge, ListChecks, ChevronDown, ChevronRight
} from 'lucide-react';
import { Badge } from '../components/ui/badge.jsx';
import { Card, CardContent } from '../components/ui/card.jsx';
import { ScrollArea, ScrollBar } from '../components/ui/scroll-area.jsx';
import { cn } from '../lib/utils.js';

const statusConfig = {
  pending: { icon: Circle, label: '等待中', colorClass: 'text-muted-foreground', badgeVariant: 'secondary' },
  running: { icon: Loader2, label: '执行中', colorClass: 'text-[hsl(var(--info))]', badgeVariant: 'default' },
  success: { icon: CheckCircle2, label: '已完成', colorClass: 'text-[hsl(var(--success))]', badgeVariant: 'success' },
  failed: { icon: XCircle, label: '失败', colorClass: 'text-destructive', badgeVariant: 'destructive' },
  skipped: { icon: SkipForward, label: '跳过', colorClass: 'text-muted-foreground', badgeVariant: 'outline' },
};

function formatDuration(ms) {
  if (ms == null) return '-';
  const value = Number(ms);
  if (!Number.isFinite(value)) return '-';
  if (value < 1000) return `${value}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString('zh-CN') : '0';
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-md border bg-background px-2.5 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon size={11} /> {label}
      </div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function PreviewBlock({ title, content }) {
  if (!content) return null;
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">{title}</div>
      <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/45 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
        {content}
      </pre>
    </div>
  );
}

export default function Pipeline({ steps = [], compact = false, onStepClick }) {
  const [expandedId, setExpandedId] = useState(null);

  const summary = useMemo(() => {
    const totalCost = steps.reduce((sum, step) => sum + (Number(step.costTime) || 0), 0);
    const totalChars = steps.reduce((sum, step) => sum + (Number(step.outputChars) || 0), 0);
    const totalSections = steps.reduce((sum, step) => sum + (Number(step.outputSections) || 0), 0);
    return { totalCost, totalChars, totalSections };
  }, [steps]);

  const handleStepClick = (step) => {
    setExpandedId(step.id === expandedId ? null : step.id);
    onStepClick?.(step);
  };

  if (compact) {
    return (
      <ScrollArea className="w-full">
        <div className="flex items-center gap-1 py-1">
          {steps.map((step, i) => {
            const cfg = statusConfig[step.status] || statusConfig.pending;
            const Icon = cfg.icon;
            return (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => handleStepClick(step)}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap',
                    step.status === 'running'
                      ? 'border-[hsl(var(--info)/0.3)] bg-[hsl(var(--info)/0.08)] text-[hsl(var(--info))]'
                      : step.status === 'success'
                        ? 'border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.06)] text-[hsl(var(--success))]'
                        : step.status === 'failed'
                          ? 'border-destructive/20 bg-destructive/5 text-destructive'
                          : 'border-border text-muted-foreground'
                  )}
                  title={`${step.name} - ${cfg.label}${step.costTime ? ` (${formatDuration(step.costTime)})` : ''}`}
                >
                  <Icon size={10} className={cn(cfg.colorClass, step.status === 'running' && 'animate-spin')} />
                  {step.name}
                </button>
                {i < steps.length - 1 && (
                  <div className={cn(
                    'mx-0.5 h-px w-3',
                    step.status === 'success' ? 'bg-[hsl(var(--success)/0.4)]' : 'bg-border'
                  )} />
                )}
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Metric icon={ListChecks} label="完成步骤" value={`${steps.length} 步`} />
        <Metric icon={Clock3} label="累计耗时" value={formatDuration(summary.totalCost)} />
        <Metric icon={FileText} label="生成规模" value={`${formatNumber(summary.totalChars)} 字`} />
      </div>

      {summary.totalSections > 0 && (
        <div className="rounded-md border bg-primary/5 px-3 py-2 text-[12px] text-muted-foreground">
          已完成内容组织、医学科普表达与段落生成，共识别/生成约
          <span className="mx-1 font-semibold text-primary">{formatNumber(summary.totalSections)}</span>
          个标题或段落单元。
        </div>
      )}

      <div className="space-y-3">
        {steps.map((step, index) => {
          const cfg = statusConfig[step.status] || statusConfig.pending;
          const Icon = cfg.icon;
          const expanded = expandedId === step.id;
          const costPercent = summary.totalCost > 0
            ? Math.max(4, Math.round(((Number(step.costTime) || 0) / summary.totalCost) * 100))
            : 0;

          return (
            <Card key={step.id} className="border bg-card">
              <CardContent className="p-3">
                <button
                  className="flex w-full items-start gap-3 text-left"
                  onClick={() => handleStepClick(step)}
                >
                  <div className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
                    step.status === 'success' && 'border-[hsl(var(--success))] bg-[hsl(var(--success)/0.1)]',
                    step.status === 'running' && 'border-[hsl(var(--info))] bg-[hsl(var(--info)/0.1)]',
                    step.status === 'failed' && 'border-destructive bg-destructive/10',
                    (step.status === 'pending' || step.status === 'skipped') && 'border-muted-foreground/30 bg-accent/40'
                  )}>
                    <Icon size={15} className={cn(cfg.colorClass, step.status === 'running' && 'animate-spin')} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-mono text-muted-foreground">#{index + 1}</span>
                          <span className="truncate text-[13px] font-semibold text-foreground">{step.name}</span>
                        </div>
                        {step.description && (
                          <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                            {step.description}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge variant={cfg.badgeVariant} className="text-[10px]">{cfg.label}</Badge>
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      <div className="rounded bg-muted/40 px-2 py-1">
                        <div className="text-[10px] text-muted-foreground">耗时</div>
                        <div className="text-[11px] font-semibold">{formatDuration(step.costTime)}</div>
                      </div>
                      <div className="rounded bg-muted/40 px-2 py-1">
                        <div className="text-[10px] text-muted-foreground">产出</div>
                        <div className="text-[11px] font-semibold">{formatNumber(step.outputChars)} 字</div>
                      </div>
                      <div className="rounded bg-muted/40 px-2 py-1">
                        <div className="text-[10px] text-muted-foreground">结构</div>
                        <div className="text-[11px] font-semibold">{formatNumber(step.outputSections)} 项</div>
                      </div>
                    </div>

                    {summary.totalCost > 0 && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/60"
                          style={{ width: `${costPercent}%` }}
                        />
                      </div>
                    )}
                  </div>
                </button>

                {step.workItems?.length > 0 && (
                  <div className="mt-3 grid gap-1.5">
                    {step.workItems.map((item, itemIndex) => (
                      <div key={itemIndex} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-[hsl(var(--success))]" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded && (
                  <div className="mt-3 space-y-3 border-t pt-3">
                    {step.modelUsed && (
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Gauge size={12} />
                        <span>模型：{step.modelUsed}</span>
                      </div>
                    )}
                    <PreviewBlock title="输入摘要" content={step.inputPreview} />
                    <PreviewBlock title="输出摘要" content={step.outputPreview} />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
