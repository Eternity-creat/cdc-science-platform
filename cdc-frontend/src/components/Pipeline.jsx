import { useState } from 'react';
import { CheckCircle2, Circle, Loader2, XCircle, SkipForward } from 'lucide-react';
import { Badge } from '../components/ui/badge.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { ScrollArea, ScrollBar } from '../components/ui/scroll-area.jsx';
import { Separator } from '../components/ui/separator.jsx';
import { cn } from '../lib/utils.js';

const statusConfig = {
  pending: { icon: Circle, label: '等待中', colorClass: 'text-muted-foreground', badgeVariant: 'secondary' },
  running: { icon: Loader2, label: '执行中', colorClass: 'text-[hsl(var(--info))]', badgeVariant: 'default' },
  success: { icon: CheckCircle2, label: '成功', colorClass: 'text-[hsl(var(--success))]', badgeVariant: 'success' },
  failed:  { icon: XCircle, label: '失败', colorClass: 'text-destructive', badgeVariant: 'destructive' },
  skipped: { icon: SkipForward, label: '跳过', colorClass: 'text-muted-foreground', badgeVariant: 'outline' },
};

export default function Pipeline({ steps = [], compact = false, onStepClick }) {
  const [selectedStep, setSelectedStep] = useState(null);

  const handleStepClick = (step) => {
    setSelectedStep(step.id === selectedStep?.id ? null : step);
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
                    'flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium transition-colors whitespace-nowrap',
                    step.status === 'running'
                      ? 'border-[hsl(var(--info)/0.3)] bg-[hsl(var(--info)/0.08)] text-[hsl(var(--info))]'
                      : step.status === 'success'
                        ? 'border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.06)] text-[hsl(var(--success))]'
                        : step.status === 'failed'
                          ? 'border-destructive/20 bg-destructive/5 text-destructive'
                          : 'border-border text-muted-foreground'
                  )}
                  title={`${step.name} - ${cfg.label}${step.costTime ? ` (${step.costTime}ms)` : ''}`}
                >
                  <Icon size={10} className={cn(cfg.colorClass, step.status === 'running' && 'animate-spin')} />
                  {step.name}
                </button>
                {i < steps.length - 1 && (
                  <div className={cn(
                    'w-3 h-px mx-0.5',
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
    <div>
      <ScrollArea className="w-full">
        <div className="flex items-start py-4">
          {steps.map((step, i) => {
            const cfg = statusConfig[step.status] || statusConfig.pending;
            const Icon = cfg.icon;
            const isSelected = selectedStep?.id === step.id;

            return (
              <div key={step.id} className="flex items-start">
                <div className="flex flex-col items-center min-w-[88px]">
                  <button
                    onClick={() => handleStepClick(step)}
                    className={cn(
                      'h-9 w-9 rounded-full border-2 flex items-center justify-center transition-all',
                      step.status === 'running' && 'border-[hsl(var(--info))] bg-[hsl(var(--info)/0.1)] ring-4 ring-[hsl(var(--info)/0.1)]',
                      step.status === 'success' && 'border-[hsl(var(--success))] bg-[hsl(var(--success)/0.1)]',
                      step.status === 'failed' && 'border-destructive bg-destructive/10',
                      (step.status === 'pending' || step.status === 'skipped') && 'border-muted-foreground/30 bg-accent/40',
                      isSelected && 'ring-4 ring-primary/20'
                    )}
                  >
                    <Icon size={16} className={cn(
                      cfg.colorClass,
                      step.status === 'running' && 'animate-spin'
                    )} />
                  </button>
                  <span className={cn(
                    'mt-2 text-[11px] font-medium text-center max-w-[72px] leading-tight',
                    step.status === 'running' ? 'text-[hsl(var(--info))]' : 'text-muted-foreground'
                  )}>
                    {step.name}
                  </span>
                  {step.costTime != null && (
                    <span className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">
                      {step.costTime}ms
                    </span>
                  )}
                  {step.parallel && (
                    <Badge variant="outline" className="text-[9px] px-1 mt-1 border-primary/30 text-primary">
                      并行
                    </Badge>
                  )}
                </div>
                {i < steps.length - 1 && (
                  <div className={cn(
                    'h-0.5 w-6 mt-[18px] shrink-0',
                    step.status === 'success' ? 'bg-[hsl(var(--success)/0.4)]' : 'bg-border'
                  )} />
                )}
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {selectedStep && (
        <Card className="mt-2">
          <CardHeader className="pb-3 p-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{selectedStep.name}</CardTitle>
              <Badge variant={(statusConfig[selectedStep.status] || statusConfig.pending).badgeVariant}>
                {(statusConfig[selectedStep.status] || statusConfig.pending).label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            {selectedStep.input && (
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">输入</p>
                <pre className="p-3 bg-accent/50 rounded-md text-xs font-mono text-muted-foreground overflow-auto max-h-[120px]">
                  {typeof selectedStep.input === 'string' ? selectedStep.input : JSON.stringify(selectedStep.input, null, 2)}
                </pre>
              </div>
            )}
            {selectedStep.output && (
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">输出</p>
                <pre className="p-3 bg-accent/50 rounded-md text-xs font-mono text-muted-foreground overflow-auto max-h-[120px]">
                  {typeof selectedStep.output === 'string' ? selectedStep.output : JSON.stringify(selectedStep.output, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
