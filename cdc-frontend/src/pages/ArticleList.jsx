import { useState, useEffect, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, Plus, Edit3, Eye, FileText, Clock, History, Bug, Pill, ChevronRight, Trash2, Loader2, FilePlus, ClipboardList, PenLine, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { Card } from '../components/ui/card.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table.jsx';
import { Skeleton } from '../components/ui/skeleton.jsx';
import Pagination from '../components/ui/pagination.jsx';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from '../components/ui/dialog.jsx';
import * as articleApi from '../api/article.js';

const STATUS_MAP = {
  1: { label: '待生成大纲', variant: 'secondary' },
  2: { label: '大纲编辑中', variant: 'default' },
  3: { label: '初稿编辑中', variant: 'warning' },
  4: { label: '终稿已确认', variant: 'success' },
  5: { label: '已发布', variant: 'success' },
};

const ENTITY_TYPE_MAP = {
  1: { label: '疾病', icon: Bug, color: 'text-[hsl(var(--color-disease))]' },
  2: { label: '疫苗', icon: Pill, color: 'text-[hsl(var(--color-vaccine))]' },
};

const statusFilter = [
  { key: 0, label: '全部' },
  { key: 1, label: '待生成' },
  { key: 2, label: '大纲中' },
  { key: 3, label: '初稿中' },
  { key: 4, label: '已确认' },
];

function getStatusInfo(status) {
  return STATUS_MAP[status] || { label: '未知', variant: 'secondary' };
}

export default function ArticleList() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState(0);
  const [search, setSearch] = useState('');
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [expandedId, setExpandedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const searchTimer = useRef(null);
  const PAGE_SIZE = 10;

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      const data = await articleApi.listArticlesPaged(
        p, PAGE_SIZE,
        filter || undefined,
        search || undefined
      );
      setArticles(Array.isArray(data.list) ? data.list : []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch (e) {
      console.error('加载文章列表失败:', e);
      toast.error('加载文章列表失败', { description: e.message || '请刷新重试' });
    } finally {
      setLoading(false);
    }
  };

  // 筛选变化时重新请求（含首次加载，filter 默认 0）
  useEffect(() => {
    setPage(1);
    fetchData(1);
  }, [filter]);

  // 获取各状态文章数量（不受筛选影响，仅挂载和删除时刷新）
  const fetchStatusCounts = () => {
    Promise.all([1, 2, 3, 4].map(s =>
      articleApi.listArticlesPaged(1, 1, s).then(d => ({ status: s, total: d.total || 0 }))
    )).then(results => {
      const counts = {};
      results.forEach(r => { counts[r.status] = r.total; });
      setStatusCounts(counts);
    }).catch(() => {});
  };

  useEffect(() => {
    fetchStatusCounts();
  }, []);

  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchData(1);
    }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const handlePageChange = (p) => {
    setPage(p);
    fetchData(p);
  };

  const handleDeleteArticle = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await articleApi.deleteArticle(deleteTarget.id);
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      fetchData(page);
      fetchStatusCounts();
      toast.success('文章已删除');
    } catch (e) {
      console.error('删除文章失败:', e);
      toast.error('删除文章失败', { description: e.message || '请重试' });
    } finally {
      setDeleting(false);
    }
  };

  const stats = [
    { label: '待生成', value: statusCounts[1] ?? 0, accent: 'text-secondary', bar: 'bg-secondary', iconBg: 'bg-secondary/10', icon: FilePlus },
    { label: '大纲中', value: statusCounts[2] ?? 0, accent: 'text-primary', bar: 'bg-primary', iconBg: 'bg-primary/10', icon: ClipboardList },
    { label: '初稿中', value: statusCounts[3] ?? 0, accent: 'text-warning', bar: 'bg-warning', iconBg: 'bg-warning/10', icon: PenLine },
    { label: '已确认', value: statusCounts[4] ?? 0, accent: 'text-success', bar: 'bg-success', iconBg: 'bg-success/10', icon: CheckCircle2 },
  ];

  return (
    <div className="page-shell page-enter">
      {/* Header */}
      <div className="page-header">
        <div className="min-w-0">
          <h1 className="text-page-title">文章列表</h1>
          <p className="text-page-desc">
            管理和查看所有已创建的科普文章
          </p>
        </div>
        <Button onClick={() => navigate('/create')} className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" />
          新建文章
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-5">
                <Skeleton className="h-8 w-12 mb-2" />
                <Skeleton className="h-3 w-16" />
              </Card>
            ))
          : stats.map((s, idx) => {
              const Icon = s.icon;
              return (
              <Card key={s.label} className="relative overflow-hidden p-5 enter-scale transition-shadow duration-300 hover:shadow-[var(--shadow-elevated)]" style={{ '--enter-delay': `${idx * 60}ms` }}>
                <div className={cn('absolute top-0 left-0 right-0 h-[3px] rounded-t-[var(--radius-lg)]', s.bar)} />
                <div className="flex items-center gap-3">
                  <div className={cn('flex items-center justify-center w-10 h-10 rounded-[var(--radius-md)] shrink-0', s.iconBg, s.accent)}>
                    <Icon size={18} strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className={cn('text-page-title', s.accent)}>
                      {s.value}
                    </div>
                    <div className="text-helper text-muted-foreground mt-0.5">
                      {s.label}
                    </div>
                  </div>
                </div>
              </Card>
              );
            })}
      </div>

      {/* Search & Filter */}
      <div className="surface-card p-4 enter" style={{ '--enter-delay': '200ms' }}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-10"
              placeholder="搜索实体名、模板名..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="status-filter-bar">
            {statusFilter.map(f => (
              <Button
                key={f.key}
                variant="ghost"
                size="sm"
                className={cn(
                  'h-9 shrink-0 px-4 transition-all duration-200',
                  filter === f.key ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''
                )}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="surface-card p-6 space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <div className="table-shell enter" style={{ '--enter-delay': '280ms' }}>
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow className="bg-primary/5">
                <TableHead className="w-[40px]" />
                <TableHead className="min-w-[320px]">主题</TableHead>
                <TableHead className="w-[180px]">模板</TableHead>
                <TableHead className="w-[130px]">状态</TableHead>
                <TableHead className="w-[170px]">创建时间</TableHead>
                <TableHead className="w-[120px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {articles.map((a, idx) => {
                const info = getStatusInfo(a.status);
                const time = a.createTime ? a.createTime.replace('T', ' ').slice(0, 16) : '';
                const entityInfo = ENTITY_TYPE_MAP[a.entityType];
                const EntityIcon = entityInfo?.icon || FileText;
                const entityColor = entityInfo?.color || 'text-muted-foreground';
                const entityLabel = entityInfo?.label || '';
                const displayName = a.entityName || a.userText?.slice(0, 20) || `文章 #${a.id}`;
                const isExpanded = expandedId === a.id;

                return (
                  <Fragment key={a.id}>
                    <TableRow
                      className="cursor-pointer enter transition-all duration-200 ease-out hover:bg-accent/40 active:scale-[0.995]"
                      style={{ '--enter-delay': `${idx * 35}ms` }}
                      onClick={() => setExpandedId(isExpanded ? null : a.id)}
                    >
                      <TableCell className="py-4">
                        <ChevronRight className={cn(
                          'h-4 w-4 text-muted-foreground transition-transform duration-300 ease-out',
                          isExpanded && 'rotate-90'
                        )} />
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'flex items-center justify-center w-9 h-9 rounded-[var(--radius-md)] bg-primary/8 transition-transform duration-200',
                            entityColor,
                            isExpanded && 'scale-110'
                          )}>
                            <EntityIcon size={16} strokeWidth={1.5} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-body font-medium truncate">{displayName}</div>
                            {entityLabel && (
                              <div className="text-micro text-muted-foreground">{entityLabel}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="block truncate text-helper text-muted-foreground">{a.templateName || '-'}</span>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant={info.variant} className="max-w-[112px] justify-center text-center leading-tight">{info.label}</Badge>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-1.5 text-helper text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {time}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-label"
                            onClick={e => {
                              e.stopPropagation();
                              navigate(`/article/${a.id}`);
                            }}
                          >
                            {a.status >= 4 ? (
                              <><Eye className="h-3.5 w-3.5" /> 查看</>
                            ) : (
                              <><Edit3 className="h-3.5 w-3.5" /> 编辑</>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive transition-colors"
                            onClick={e => {
                              e.stopPropagation();
                              setDeleteTarget({ id: a.id, name: displayName });
                              setDeleteConfirmOpen(true);
                            }}
                            title="删除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expandable detail row */}
                    {isExpanded && (
                      <TableRow className="bg-accent/20 row-expand-enter">
                        <TableCell colSpan={6} className="py-3 px-6">
                          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-helper text-muted-foreground pl-[88px]">
                            <div className="flex items-center gap-1.5">
                              <History className="h-3.5 w-3.5" />
                              <span className="text-label">修改次数:</span>
                              <span>{a.modifyCount || 0}</span>
                            </div>
                            {a.updateTime && (
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" />
                                <span className="text-label">最后更新:</span>
                                <span>{a.updateTime.replace('T', ' ').slice(0, 16)}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {!loading && articles.length > 0 && (
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={handlePageChange} />
      )}

      {/* Empty state */}
      {!loading && articles.length === 0 && (
        <div className="surface-card text-center py-16">
          <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-body font-medium">没有找到匹配的文章</p>
          <p className="text-helper text-muted-foreground mt-1">
            尝试调整筛选条件或创建新文章
          </p>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除文章「{deleteTarget?.name}」吗？相关的留痕记录和 Agent 轨迹也会被一并删除，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDeleteArticle} disabled={deleting}>
              {deleting && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
