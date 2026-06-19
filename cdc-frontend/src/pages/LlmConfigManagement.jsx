import { useState, useEffect, useCallback } from 'react';
import { FileText, Database, Image, Plus, Check, AlertTriangle, Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Skeleton } from '../components/ui/skeleton.jsx';
import { cn } from '../lib/utils.js';
import * as llmApi from '../api/llmConfig.js';
import ConfigCardStack from '../components/llm/ConfigCardStack.jsx';

/**
 * LLM 配置管理页面 — 多配置 + 扑克牌卡片堆叠模式。
 *
 * 每种类型（文章生成 / 向量嵌入 / 图片生成）可拥有多个配置，
 * 通过启用/禁用切换实际使用的模型。
 * 点击卡片弹出 ConfigCardStack Dialog 浏览和管理。
 */

const CATEGORIES = [
  {
    key: 'text_generation',
    label: '文章生成',
    icon: FileText,
    desc: '覆盖大纲生成、初稿撰写、事实核查、规则检查、意图解析等所有文本任务',
    accentClass: 'from-blue-500/10 to-blue-600/5 border-blue-200',
    iconBg: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  },
  {
    key: 'embedding',
    label: '向量嵌入',
    icon: Database,
    desc: '片段 embedding 向量计算，Java 端入库 + Agent 端检索共用',
    accentClass: 'from-emerald-500/10 to-emerald-600/5 border-emerald-200',
    iconBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
  },
  {
    key: 'image_generation',
    label: '图片生成',
    icon: Image,
    desc: '文章配图生成',
    accentClass: 'from-violet-500/10 to-violet-600/5 border-violet-200',
    iconBg: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400',
  },
];

/**
 * 从配置列表中选出当前活跃配置。
 * 优先 is_default=1 且 is_enabled=1，其次取最新一条 is_enabled=1。
 */
function pickActive(list) {
  if (!list || list.length === 0) return null;
  const enabled = list.filter(c => c.isEnabled);
  if (enabled.length === 0) return null;
  const def = enabled.find(c => c.isDefault);
  return def || enabled[0];
}

export default function LlmConfigManagement() {
  // { text_generation: [...configs], embedding: [...], image_generation: [...] }
  const [allConfigs, setAllConfigs] = useState({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const result = {};
    await Promise.all(
      CATEGORIES.map(async (cat) => {
        try {
          const list = await llmApi.listByType(cat.key);
          result[cat.key] = Array.isArray(list) ? list : [];
        } catch {
          result[cat.key] = [];
        }
      })
    );
    setAllConfigs(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = {};
      await Promise.all(
        CATEGORIES.map(async (cat) => {
          try {
            const list = await llmApi.listByType(cat.key);
            result[cat.key] = Array.isArray(list) ? list : [];
          } catch {
            result[cat.key] = [];
          }
        })
      );
      if (!cancelled) {
        setAllConfigs(result);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleCardClick = (catKey) => {
    setActiveCategory(catKey);
    setDialogOpen(true);
  };

  const activeCat = CATEGORIES.find(c => c.key === activeCategory);

  return (
    <div className="p-6 lg:p-8 page-enter">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-page-title flex items-center gap-2">
          <Database size={24} /> LLM 配置
        </h1>
        <p className="text-page-desc mt-1">
          管理三类模型配置，每种类型可创建多个配置并通过启用/禁用切换。未配置时使用 .env 中的兜底默认值。
        </p>
      </div>

      {/* 3 Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {CATEGORIES.map((cat) => {
          const list = allConfigs[cat.key] || [];
          const active = pickActive(list);
          const IconComp = cat.icon;

          if (loading) {
            return (
              <Card key={cat.key} className="rounded-xl">
                <CardHeader className="pb-3">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-4 w-48 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            );
          }

          return (
            <Card
              key={cat.key}
              className={cn(
                'rounded-xl border cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 bg-gradient-to-br',
                cat.accentClass
              )}
              onClick={() => handleCardClick(cat.key)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', cat.iconBg)}>
                    <IconComp size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{cat.label}</CardTitle>
                      {list.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                          <Layers size={11} /> {list.length}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{cat.desc}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {active ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs font-mono">{active.modelName}</Badge>
                      <Badge variant="secondary" className="text-[11px]">{active.provider}</Badge>
                    </div>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <Check size={12} className="text-[hsl(var(--success))]" />
                      <span className="text-xs text-[hsl(var(--success))]">已启用</span>
                    </div>
                  </div>
                ) : list.length > 0 ? (
                  <div className="flex items-center gap-1.5 py-2">
                    <AlertTriangle size={13} className="text-[hsl(var(--warning))]" />
                    <span className="text-xs text-[hsl(var(--warning))] font-medium">
                      {list.length} 个配置，全部已禁用
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground py-2">
                    <Plus size={14} />
                    <span className="text-sm">点击配置模型</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Poker Card Stack Dialog */}
      {activeCat && (
        <ConfigCardStack
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          configs={allConfigs[activeCategory] || []}
          configType={activeCategory}
          typeLabel={activeCat.label}
          typeDesc={activeCat.desc}
          onRefresh={fetchAll}
        />
      )}
    </div>
  );
}
