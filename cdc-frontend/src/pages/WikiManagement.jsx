import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Plus, Upload, ChevronRight, Trash2, Pencil,
  BookOpen, Link2, Shield, FileText, Bug, Pill, Users, MapPin,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent } from '../components/ui/card.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Input } from '../components/ui/input.jsx';
import { Textarea } from '../components/ui/textarea.jsx';
import { Skeleton } from '../components/ui/skeleton.jsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.jsx';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from '../components/ui/dialog.jsx';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription
} from '../components/ui/sheet.jsx';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from '../components/ui/select.jsx';
import { ScrollArea } from '../components/ui/scroll-area.jsx';
import { cn } from '../lib/utils.js';
import Pagination from '../components/ui/pagination.jsx';
import * as wikiApi from '../api/wiki.js';

const typeIcons = {
  1: { icon: Bug, label: '疾病', color: 'text-[hsl(var(--color-disease))]' },
  2: { icon: Pill, label: '疫苗', color: 'text-[hsl(var(--color-vaccine))]' },
  3: { icon: Users, label: '人群', color: 'text-[hsl(var(--color-population))]' },
  4: { icon: MapPin, label: '场景', color: 'text-[hsl(var(--color-scene))]' },
};

const typeFilters = [
  { type: 0, label: '全部' },
  { type: 1, label: '疾病' },
  { type: 2, label: '疫苗' },
  { type: 3, label: '人群' },
  { type: 4, label: '场景' },
];

const entityTypeOptions = [
  { value: 1, label: '疾病' },
  { value: 2, label: '疫苗' },
  { value: 3, label: '人群' },
  { value: 4, label: '场景' },
];

function getTypeInfo(type) {
  return typeIcons[type] || { icon: FileText, label: '未知', color: 'text-muted-foreground' };
}

function parseAliasList(alias) {
  if (!alias) return [];
  try {
    const parsed = JSON.parse(alias);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* not JSON */ }
  return alias.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
}

const emptyEntityForm = { entityType: 1, stdName: '', alias: '', summary: '' };
const emptySegmentForm = { content: '', source: '' };
const emptyRuleForm = { content: '', ruleType: 'MustInclude' };

const RULE_TYPE_MAP = {
  MustInclude: { label: '必须', variant: 'default', className: 'bg-[hsl(var(--accent-mint))]/15 text-[hsl(var(--accent-mint))] border-[hsl(var(--accent-mint))]/20' },
  MustNotSay: { label: '禁用', variant: 'warning', className: 'bg-[hsl(var(--accent-coral))]/15 text-[hsl(var(--accent-coral))] border-[hsl(var(--accent-coral))]/20' },
};

export default function WikiManagement() {
  const [selectedType, setSelectedType] = useState(0);
  const [search, setSearch] = useState('');
  const [entities, setEntities] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [detailTab, setDetailTab] = useState('segments');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const searchTimer = useRef(null);
  const WIKI_PAGE_SIZE = 15;
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  // Sheet state
  const [entityDrawerOpen, setEntityDrawerOpen] = useState(false);
  const [entityFormData, setEntityFormData] = useState({ ...emptyEntityForm });
  const [entitySubmitting, setEntitySubmitting] = useState(false);
  const [entityEditing, setEntityEditing] = useState(false);

  const [segmentDrawerOpen, setSegmentDrawerOpen] = useState(false);
  const [segmentFormData, setSegmentFormData] = useState({ ...emptySegmentForm });
  const [segmentSubmitting, setSegmentSubmitting] = useState(false);

  const [ruleDrawerOpen, setRuleDrawerOpen] = useState(false);
  const [ruleFormData, setRuleFormData] = useState({ ...emptyRuleForm });
  const [ruleSubmitting, setRuleSubmitting] = useState(false);

  // Delete confirm (keep as small Dialog)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchEntities = async (p = page) => {
    setLoading(true);
    try {
      const data = await wikiApi.listWikiPaged(
        p, WIKI_PAGE_SIZE,
        selectedType || undefined,
        search || undefined
      );
      const list = Array.isArray(data.list) ? data.list : [];
      setEntities(list);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
      if (p === 1 && list.length > 0 && !selectedEntity) {
        setSelectedEntity(list[0]);
      }
    } catch (e) {
      console.error('加载实体列表失败:', e);
      toast.error('加载实体列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await wikiApi.listWikiPaged(1, WIKI_PAGE_SIZE);
        if (!cancelled) {
          const list = Array.isArray(data.list) ? data.list : [];
          setEntities(list);
          setTotalPages(data.totalPages || 1);
          setTotal(data.total || 0);
          if (list.length > 0) {
            setSelectedEntity(list[0]);
          }
        }
      } catch (e) {
        console.error('加载实体列表失败:', e);
        toast.error('加载实体列表失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Track whether detail is enriched (loaded from detail API) vs basic (from list)
  const [detailEnriched, setDetailEnriched] = useState(false);

  useEffect(() => {
    if (!selectedEntity?.id) return;
    let cancelled = false;
    setDetailEnriched(false);
    async function loadDetail() {
      setDetailLoading(true);
      try {
        const detail = await wikiApi.getWikiEntity(selectedEntity.id);
        if (!cancelled) {
          setSelectedEntity(detail);
          setDetailEnriched(true);
        }
      } catch (e) {
        console.error('加载实体详情失败:', e);
        // Keep the basic data from list as fallback
        setDetailEnriched(true);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }
    loadDetail();
    return () => { cancelled = true; };
  }, [selectedEntity?.id]);

  const reloadDetail = useCallback(async () => {
    if (!selectedEntity?.id) return;
    setDetailLoading(true);
    try {
      const detail = await wikiApi.getWikiEntity(selectedEntity.id);
      setSelectedEntity(detail);
      setDetailEnriched(true);
    } catch (e) {
      console.error('加载实体详情失败:', e);
      setDetailEnriched(true);
    } finally {
      setDetailLoading(false);
    }
  }, [selectedEntity?.id]);

  const reloadEntityList = useCallback(async (p = page) => {
    try {
      const data = await wikiApi.listWikiPaged(
        p, WIKI_PAGE_SIZE,
        selectedType || undefined,
        search || undefined
      );
      const list = Array.isArray(data.list) ? data.list : [];
      setEntities(list);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch (e) {
      console.error('刷新实体列表失败:', e);
    }
  }, [page, selectedType, search]);

  // 筛选类型变化时重新请求
  useEffect(() => {
    setPage(1);
    fetchEntities(1);
  }, [selectedType]);

  // 搜索框防抖重新请求
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchEntities(1);
    }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const segments = selectedEntity?.segments || [];
  const rules = selectedEntity?.rules || [];
  const relatedIds = selectedEntity?.relatedIds || [];

  const handleSelectEntity = (entity) => {
    setSelectedEntity(entity);
    setDetailTab('segments');
    setDetailEnriched(false);
    setMobileShowDetail(true);
  };

  // ---- Entity handlers ----
  const openCreateEntityDrawer = () => {
    setEntityFormData({ ...emptyEntityForm });
    setEntityEditing(false);
    setEntityDrawerOpen(true);
  };

  const openEditEntityDrawer = () => {
    if (!selectedEntity) return;
    const aliasList = parseAliasList(selectedEntity.alias);
    setEntityFormData({
      entityType: selectedEntity.entityType || 1,
      stdName: selectedEntity.stdName || '',
      alias: aliasList.join(', '),
      summary: selectedEntity.summary || '',
    });
    setEntityEditing(true);
    setEntityDrawerOpen(true);
  };

  const handleSaveEntity = async () => {
    if (!entityFormData.stdName.trim()) {
      toast.error('请输入标准名称');
      return;
    }
    setEntitySubmitting(true);
    try {
      const aliasArr = entityFormData.alias.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
      const aliasJson = aliasArr.length > 0 ? JSON.stringify(aliasArr) : '';
      const payload = {
        entityType: Number(entityFormData.entityType),
        stdName: entityFormData.stdName.trim(),
        alias: aliasJson || undefined,
        summary: entityFormData.summary.trim() || undefined,
      };
      if (entityEditing && selectedEntity?.id) {
        await wikiApi.updateWikiEntity(selectedEntity.id, payload);
        toast.success('实体更新成功');
        await reloadDetail();
        await reloadEntityList();
      } else {
        await wikiApi.addWikiEntity(payload);
        toast.success('实体创建成功');
        await reloadEntityList();
      }
      setEntityDrawerOpen(false);
      setEntityFormData({ ...emptyEntityForm });
    } catch (e) {
      console.error(entityEditing ? '更新实体失败' : '创建实体失败', e);
      toast.error(entityEditing ? '更新实体失败' : '创建实体失败');
    } finally {
      setEntitySubmitting(false);
    }
  };

  const handleDeleteEntity = async () => {
    if (!deleteTarget || deleteTarget.type !== 'entity') return;
    try {
      await wikiApi.deleteWikiEntity(deleteTarget.id);
      toast.success('实体删除成功');
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      const remaining = entities.filter(e => e.id !== deleteTarget.id);
      setEntities(remaining);
      if (selectedEntity?.id === deleteTarget.id) {
        setSelectedEntity(remaining.length > 0 ? remaining[0] : null);
        if (remaining.length === 0) setMobileShowDetail(false);
      }
      await reloadEntityList();
    } catch (e) {
      console.error('删除实体失败:', e);
      toast.error('删除实体失败');
    }
  };

  const confirmDeleteEntity = () => {
    if (!selectedEntity) return;
    setDeleteTarget({ type: 'entity', id: selectedEntity.id, name: selectedEntity.stdName });
    setDeleteConfirmOpen(true);
  };

  // ---- Segment handlers ----
  const openAddSegmentDrawer = () => {
    setSegmentFormData({ ...emptySegmentForm });
    setSegmentDrawerOpen(true);
  };

  const handleAddSegment = async () => {
    if (!segmentFormData.content.trim()) { toast.error('请输入片段内容'); return; }
    if (!selectedEntity?.id) return;
    setSegmentSubmitting(true);
    try {
      await wikiApi.addSegment({
        entityId: selectedEntity.id,
        content: segmentFormData.content.trim(),
        source: segmentFormData.source.trim() || undefined,
      });
      toast.success('片段添加成功');
      setSegmentDrawerOpen(false);
      setSegmentFormData({ ...emptySegmentForm });
      await reloadDetail();
      await reloadEntityList();
    } catch (e) {
      console.error('添加片段失败:', e);
      toast.error('添加片段失败');
    } finally {
      setSegmentSubmitting(false);
    }
  };

  const handleDeleteSegment = async (segmentId) => {
    try {
      await wikiApi.deleteSegment(segmentId);
      toast.success('片段删除成功');
      await reloadDetail();
      await reloadEntityList();
    } catch (e) {
      console.error('删除片段失败:', e);
      toast.error('删除片段失败');
    }
  };

  // ---- Rule handlers ----
  const openAddRuleDrawer = () => {
    setRuleFormData({ ...emptyRuleForm });
    setRuleDrawerOpen(true);
  };

  const handleAddRule = async () => {
    if (!ruleFormData.content.trim()) { toast.error('请输入规则内容'); return; }
    if (!selectedEntity?.id) return;
    setRuleSubmitting(true);
    try {
      await wikiApi.addRule({
        entityId: selectedEntity.id,
        content: ruleFormData.content.trim(),
        ruleType: ruleFormData.ruleType || 'MustInclude',
      });
      toast.success('规则添加成功');
      setRuleDrawerOpen(false);
      setRuleFormData({ ...emptyRuleForm });
      await reloadDetail();
      await reloadEntityList();
    } catch (e) {
      console.error('添加规则失败:', e);
      toast.error('添加规则失败');
    } finally {
      setRuleSubmitting(false);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      await wikiApi.deleteRule(ruleId);
      toast.success('规则删除成功');
      await reloadDetail();
      await reloadEntityList();
    } catch (e) {
      console.error('删除规则失败:', e);
      toast.error('删除规则失败');
    }
  };

  const handleImport = () => { toast.info('功能开发中'); };

  return (
    <div className="flex h-full overflow-hidden page-enter">
      {/* Left panel - entity list */}
      <div className={cn(
        'w-full md:w-[360px] md:shrink-0 border-r flex flex-col overflow-hidden bg-card',
        mobileShowDetail ? 'hidden md:flex' : 'flex'
      )}>
        {/* List header */}
        <div className="p-4 border-b">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-section-title">Wiki 知识库</h2>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="h-8 px-2.5 text-label gap-1" onClick={handleImport}>
                <Upload size={13} /> 导入
              </Button>
              <Button size="sm" className="h-8 px-2.5 text-label gap-1 text-primary-foreground" onClick={openCreateEntityDrawer}>
                <Plus size={13} /> 新增
              </Button>
            </div>
          </div>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索实体名称..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <div className="flex gap-1">
            {typeFilters.map(t => (
              <Button
                key={t.type}
                variant="ghost"
                size="sm"
                className={cn('h-8 px-2.5 text-label', selectedType === t.type && 'bg-primary text-primary-foreground hover:bg-primary/90')}
                onClick={() => setSelectedType(t.type)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="py-1">
            {loading ? (
              <div className="space-y-1 p-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="p-3 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : entities.map((entity, idx) => {
              const info = getTypeInfo(entity.entityType);
              const Icon = info.icon;
              const isSelected = selectedEntity?.id === entity.id;
              return (
                <div
                  key={entity.id}
                  onClick={() => handleSelectEntity(entity)}
                  style={{ '--enter-delay': `${idx * 40}ms` }}
                  className={cn(
                    'px-4 py-3.5 border-b cursor-pointer enter',
                    'transition-all duration-200 ease-out active:scale-[0.99]',
                    isSelected
                      ? 'bg-accent border-l-2 border-l-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)]'
                      : 'border-l-2 border-l-transparent hover:bg-accent/50 hover:translate-x-0.5'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={cn(
                      'flex items-center justify-center w-6 h-6 rounded-md transition-all duration-200',
                      isSelected ? 'bg-primary/12 scale-110' : 'bg-transparent group-hover:scale-105'
                    )}>
                      <Icon size={14} className={info.color} strokeWidth={1.5} />
                    </div>
                    <span className={cn(
                      'text-body font-medium truncate transition-colors duration-200',
                      isSelected && 'text-primary'
                    )}>{entity.stdName}</span>
                    <Badge variant="secondary" className="ml-auto text-micro px-1.5">{info.label}</Badge>
                  </div>
                  {entity.summary && (
                    <p className="text-helper text-muted-foreground line-clamp-2">{entity.summary}</p>
                  )}
                  <div className="flex gap-3 mt-1.5 text-micro text-muted-foreground/60">
                    <span>片段 {entity.segments ? entity.segments.length : 0}</span>
                    <span>规则 {entity.rules ? entity.rules.length : 0}</span>
                    <span>关联 {entity.relatedIds ? entity.relatedIds.length : 0}</span>
                  </div>
                </div>
              );
            })}
            {!loading && entities.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-body font-medium">未找到匹配的实体</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Pagination */}
        {!loading && entities.length > 0 && (
          <div className="px-4 pb-3 border-t border-border/50">
            <Pagination page={page} totalPages={totalPages} total={total} onPageChange={(p) => { setPage(p); fetchEntities(p); }} />
          </div>
        )}
      </div>

      {/* Right panel - detail */}
      <div className={cn(
        'flex-1 flex flex-col overflow-hidden',
        mobileShowDetail ? 'flex' : 'hidden md:flex'
      )}>
        {!selectedEntity ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <BookOpen className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-body font-medium">选择一个实体查看详情</p>
            </div>
          </div>
        ) : (
          <div key={selectedEntity.id} className="flex-1 flex flex-col overflow-hidden enter">
            {/* Mobile back button */}
            <div className="md:hidden flex items-center gap-2 p-3 border-b">
              <Button variant="ghost" size="sm" onClick={() => setMobileShowDetail(false)} className="gap-1">
                <ChevronRight size={14} className="rotate-180" /> 返回列表
              </Button>
            </div>

            {/* Header — always show available data, no skeleton flash */}
            <div className="p-5 lg:p-6 border-b relative enter" style={{ '--enter-delay': '60ms' }}>
              {detailLoading && (
                <div className="absolute top-2 right-2 z-10">
                  <Loader2 size={14} className="animate-spin text-primary/50" />
                </div>
              )}
              <div className="flex items-center gap-2.5 mb-2">
                <div className={cn(
                  'flex items-center justify-center w-10 h-10 rounded-[var(--radius-md)] bg-primary/8',
                  'transition-transform duration-300 hover:scale-110 hover:rotate-3',
                  getTypeInfo(selectedEntity.entityType).color
                )}>
                  {(() => { const Icon = getTypeInfo(selectedEntity.entityType).icon; return <Icon size={18} />; })()}
                </div>
                <h2 className="text-xl font-semibold tracking-tight">{selectedEntity.stdName}</h2>
                <Badge variant="secondary">{getTypeInfo(selectedEntity.entityType).label}</Badge>
                <div className="ml-auto flex gap-1.5">
                  <Button variant="ghost" size="sm" className="text-label gap-1 " onClick={openEditEntityDrawer}>
                    <Pencil size={13} /> 编辑
                  </Button>
                  <Button variant="ghost" size="sm" className="text-label text-destructive gap-1 " onClick={confirmDeleteEntity}>
                    <Trash2 size={13} /> 删除
                  </Button>
                </div>
              </div>
              {selectedEntity.alias && (
                <div className="flex flex-wrap gap-1.5 mb-2 mt-3">
                  {parseAliasList(selectedEntity.alias).map((a, i) => (
                    <Badge key={i} variant="outline" className="text-label font-normal enter" style={{ '--enter-delay': `${120 + i * 40}ms` }}>{a}</Badge>
                  ))}
                </div>
              )}
              {selectedEntity.summary && (
                <p className="text-helper text-muted-foreground leading-relaxed whitespace-pre-wrap">{selectedEntity.summary}</p>
              )}
            </div>

            {/* Tabs */}
            <Tabs value={detailTab} onValueChange={setDetailTab} className="flex-1 flex flex-col overflow-hidden enter" style={{ '--enter-delay': '120ms' }}>
              <div className="px-5 lg:px-6 pt-3">
                <TabsList className="w-full bg-transparent border-0 p-0 gap-1">
                  <TabsTrigger value="segments" className="flex-1 gap-1.5 text-label data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                    <BookOpen size={13} /> 知识片段
                    <Badge variant={detailTab === 'segments' ? 'default' : 'secondary'} className={cn('text-micro px-1.5 ml-1', detailTab === 'segments' && 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20')}>{segments.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="rules" className="flex-1 gap-1.5 text-label data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                    <Shield size={13} /> 约束规则
                    <Badge variant={detailTab === 'rules' ? 'default' : 'secondary'} className={cn('text-micro px-1.5 ml-1', detailTab === 'rules' && 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20')}>{rules.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="relations" className="flex-1 gap-1.5 text-label data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                    <Link2 size={13} /> 关联实体
                    <Badge variant={detailTab === 'relations' ? 'default' : 'secondary'} className={cn('text-micro px-1.5 ml-1', detailTab === 'relations' && 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20')}>{relatedIds.length}</Badge>
                  </TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-5 lg:p-6">
                  {/* Segments Tab */}
                  <TabsContent value="segments" className="mt-0">
                    <div className="flex justify-end mb-3">
                      <Button variant="outline" size="sm" className="text-label gap-1" onClick={openAddSegmentDrawer}>
                        <Plus size={13} /> 添加片段
                      </Button>
                    </div>
                    {detailLoading && !detailEnriched && segments.length === 0 ? (
                      <div className="space-y-3">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-24 w-full rounded-[var(--radius-lg)]" />
                        ))}
                      </div>
                    ) : segments.length > 0 ? (
                      <div className="space-y-3">
                        {segments.map((seg, idx) => (
                          <Card key={seg.id} className="enter-scale" style={{ '--enter-delay': `${idx * 50}ms` }}>
                            <CardContent className="p-4">
                              <p className="text-body text-muted-foreground leading-relaxed mb-3">{seg.content}</p>
                              <div className="flex justify-between items-center">
                                <span className="text-label text-primary">{seg.source || ''}</span>
                                <Button
                                  variant="ghost" size="sm"
                                  className="h-7 w-7 p-0 text-destructive transition-colors"
                                  onClick={() => handleDeleteSegment(seg.id)}
                                  title="删除片段"
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-10 text-muted-foreground">
                        <p className="text-body">暂无知识片段</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Rules Tab */}
                  <TabsContent value="rules" className="mt-0">
                    <div className="flex justify-end mb-3">
                      <Button variant="outline" size="sm" className="text-label gap-1" onClick={openAddRuleDrawer}>
                        <Plus size={13} /> 添加规则
                      </Button>
                    </div>
                    {detailLoading && !detailEnriched && rules.length === 0 ? (
                      <div className="space-y-3">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-14 w-full rounded-[var(--radius-lg)]" />
                        ))}
                      </div>
                    ) : rules.length > 0 ? (
                      <div className="space-y-2">
                        {rules.map((rule, i) => {
                          const ruleId = typeof rule === 'object' ? rule.id : i;
                          const ruleType = typeof rule === 'object' ? (rule.ruleType || 'MustInclude') : 'MustInclude';
                          const ruleContent = typeof rule === 'string' ? rule : (rule.content || '');
                          const typeInfo = RULE_TYPE_MAP[ruleType] || RULE_TYPE_MAP.MustInclude;
                          return (
                            <Card key={ruleId} className="enter-scale" style={{ '--enter-delay': `${i * 50}ms` }}>
                              <CardContent className="p-3.5 flex items-center gap-3">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-micro shrink-0 w-[42px] justify-center font-medium',
                                    typeInfo.className
                                  )}
                                >
                                  {typeInfo.label}
                                </Badge>
                                <span className="flex-1 text-body text-muted-foreground">
                                  {ruleContent}
                                </span>
                                <Button
                                  variant="ghost" size="sm"
                                  className="h-7 w-7 p-0 text-destructive shrink-0 transition-colors"
                                  onClick={() => handleDeleteRule(ruleId)}
                                  title="删除规则"
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-10 text-muted-foreground">
                        <p className="text-body">暂无约束规则</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Relations Tab */}
                  <TabsContent value="relations" className="mt-0">
                    <div className="flex justify-end mb-3">
                      <Button variant="outline" size="sm" className="text-label gap-1" onClick={() => toast.info('功能开发中')}>
                        <Plus size={13} /> 添加关联
                      </Button>
                    </div>
                    {detailLoading && !detailEnriched && relatedIds.length === 0 ? (
                      <div className="space-y-3">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-14 w-full rounded-[var(--radius-lg)]" />
                        ))}
                      </div>
                    ) : relatedIds.length > 0 ? (
                      <div className="space-y-2">
                        {relatedIds.map((relId, i) => (
                          <Card key={i} className="enter-scale" style={{ '--enter-delay': `${i * 50}ms` }}>
                            <CardContent className="p-3.5 flex items-center gap-3">
                              <div className="h-9 w-9 rounded-[var(--radius-md)] bg-primary/8 flex items-center justify-center shrink-0">
                                <ChevronRight size={14} className="text-muted-foreground" />
                              </div>
                              <span className="text-body font-medium">实体 #{relId}</span>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-10 text-muted-foreground">
                        <p className="text-body">暂无关联实体</p>
                      </div>
                    )}
                  </TabsContent>
                </div>
              </ScrollArea>
            </Tabs>
          </div>
        )}
      </div>

      {/* ========================
          Entity Create/Edit Drawer
         ======================== */}
      <Sheet open={entityDrawerOpen} onOpenChange={setEntityDrawerOpen}>
        <SheetContent>
          <SheetHeader className="mb-6">
            <SheetTitle>{entityEditing ? '编辑实体' : '新增实体'}</SheetTitle>
            <SheetDescription>
              {entityEditing ? '修改实体的基本信息' : '创建一个新的 Wiki 实体，标准名称为必填项。'}
            </SheetDescription>
          </SheetHeader>

          <div className="drawer-section">
            <div className="drawer-field">
              <label>实体类型</label>
              <Select
                value={String(entityFormData.entityType)}
                onValueChange={val => setEntityFormData(prev => ({ ...prev, entityType: Number(val) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  {entityTypeOptions.map(opt => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="drawer-field">
              <label>标准名称 <span className="text-destructive">*</span></label>
              <Input
                placeholder="请输入标准名称"
                value={entityFormData.stdName}
                onChange={e => setEntityFormData(prev => ({ ...prev, stdName: e.target.value }))}
              />
            </div>

            <div className="drawer-field">
              <label>别名</label>
              <Input
                placeholder="多个别名用逗号分隔"
                value={entityFormData.alias}
                onChange={e => setEntityFormData(prev => ({ ...prev, alias: e.target.value }))}
              />
              <span className="helper">支持逗号、顿号分隔多个别名</span>
            </div>

            <div className="drawer-field">
              <label>摘要</label>
              <Textarea
                placeholder="可选，输入摘要信息"
                value={entityFormData.summary}
                onChange={e => setEntityFormData(prev => ({ ...prev, summary: e.target.value }))}
                rows={4}
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEntityDrawerOpen(false)}>取消</Button>
            <Button onClick={handleSaveEntity} disabled={entitySubmitting || !entityFormData.stdName.trim()}>
              {entitySubmitting && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              {entityEditing ? '保存修改' : '创建'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ========================
          Add Segment Drawer
         ======================== */}
      <Sheet open={segmentDrawerOpen} onOpenChange={setSegmentDrawerOpen}>
        <SheetContent>
          <SheetHeader className="mb-6">
            <SheetTitle>添加知识片段</SheetTitle>
            <SheetDescription>为当前实体添加一条知识片段。</SheetDescription>
          </SheetHeader>

          <div className="drawer-section">
            <div className="drawer-field">
              <label>内容 <span className="text-destructive">*</span></label>
              <Textarea
                placeholder="请输入片段内容"
                value={segmentFormData.content}
                onChange={e => setSegmentFormData(prev => ({ ...prev, content: e.target.value }))}
                rows={6}
              />
            </div>
            <div className="drawer-field">
              <label>来源</label>
              <Input
                placeholder="可选，输入来源信息"
                value={segmentFormData.source}
                onChange={e => setSegmentFormData(prev => ({ ...prev, source: e.target.value }))}
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSegmentDrawerOpen(false)}>取消</Button>
            <Button onClick={handleAddSegment} disabled={segmentSubmitting || !segmentFormData.content.trim()}>
              {segmentSubmitting && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              添加
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ========================
          Add Rule Drawer
         ======================== */}
      <Sheet open={ruleDrawerOpen} onOpenChange={setRuleDrawerOpen}>
        <SheetContent>
          <SheetHeader className="mb-6">
            <SheetTitle>添加约束规则</SheetTitle>
            <SheetDescription>为当前实体添加一条约束规则。</SheetDescription>
          </SheetHeader>

          <div className="drawer-section">
            <div className="drawer-field">
              <label>规则类型</label>
              <Select
                value={ruleFormData.ruleType}
                onValueChange={val => setRuleFormData(prev => ({ ...prev, ruleType: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择规则类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MustInclude">必须包含</SelectItem>
                  <SelectItem value="MustNotSay">禁止表述</SelectItem>
                </SelectContent>
              </Select>
              <span className="helper">必须：文章需覆盖的要点；禁用：不允许出现的话术</span>
            </div>
            <div className="drawer-field">
              <label>规则内容 <span className="text-destructive">*</span></label>
              <Textarea
                placeholder="请输入规则内容"
                value={ruleFormData.content}
                onChange={e => setRuleFormData(prev => ({ ...prev, content: e.target.value }))}
                rows={6}
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRuleDrawerOpen(false)}>取消</Button>
            <Button onClick={handleAddRule} disabled={ruleSubmitting || !ruleFormData.content.trim()}>
              {ruleSubmitting && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              添加
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ========================
          Delete Confirm Dialog (keep small)
         ======================== */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除实体「{deleteTarget?.name}」吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDeleteEntity}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
