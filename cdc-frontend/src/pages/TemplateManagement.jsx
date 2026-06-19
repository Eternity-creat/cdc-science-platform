import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Grid3X3, List, Edit3, Trash2, Eye,
  FileText, Mic2, ListOrdered, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../components/ui/card.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Input } from '../components/ui/input.jsx';
import { Textarea } from '../components/ui/textarea.jsx';
import { Separator } from '../components/ui/separator.jsx';
import { Skeleton } from '../components/ui/skeleton.jsx';
import { ScrollArea } from '../components/ui/scroll-area.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog.jsx';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../components/ui/sheet.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table.jsx';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.jsx';
import { cn } from '../lib/utils.js';
import Pagination from '../components/ui/pagination.jsx';
import * as templateApi from '../api/template.js';

const tagOptions = ['疾病科普', '疫苗接种', '应急科普', '校园健康', '社区宣传', '预警通知'];

const tagVariantMap = {
  '疾病科普': 'default',
  '疫苗接种': 'success',
  '应急科普': 'destructive',
  '校园健康': 'warning',
  '社区宣传': 'success',
  '预警通知': 'destructive',
};

function parseJsonField(field) {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  try {
    const parsed = JSON.parse(field);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return field.split('、').filter(Boolean);
  }
}

const emptyFormData = {
  templateName: '',
  tag: '',
  purpose: '',
  tone: '',
  outlineStructure: '',
  status: 1,
};

export default function TemplateManagement() {
  const [viewMode, setViewMode] = useState('grid');
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 12;

  const [formDrawerOpen, setFormDrawerOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState({ ...emptyFormData });
  const [submitting, setSubmitting] = useState(false);

  const loadTemplates = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const data = await templateApi.listTemplatesPaged(p, PAGE_SIZE);
      setTemplates(Array.isArray(data.list) ? data.list : []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch (e) {
      console.error('加载模板列表失败:', e);
      toast.error('操作失败: ' + (e.message || '加载模板列表失败'));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await templateApi.listTemplatesPaged(1, PAGE_SIZE);
        if (!cancelled) {
          setTemplates(Array.isArray(data.list) ? data.list : []);
          setTotalPages(data.totalPages || 1);
          setTotal(data.total || 0);
        }
      } catch (e) {
        console.error('加载模板列表失败:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ---------- Detail drawer ----------
  const openDetail = (t) => {
    setSelectedTemplate(t);
    setDetailDrawerOpen(true);
  };

  // ---------- Create / Edit drawer ----------
  const openCreateDrawer = () => {
    setEditingTemplate(null);
    setFormData({ ...emptyFormData });
    setFormDrawerOpen(true);
  };

  const openEditDrawer = (t) => {
    setEditingTemplate(t);
    const outline = parseJsonField(t.outlineStructure);
    setFormData({
      templateName: t.templateName || '',
      tag: t.tag || '',
      purpose: t.purpose || '',
      tone: typeof t.tone === 'string' ? t.tone : parseJsonField(t.tone).join(','),
      outlineStructure: outline.join('\n'),
      status: t.status ?? 1,
    });
    setFormDrawerOpen(true);
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFormSubmit = async () => {
    if (!formData.templateName.trim()) {
      toast.error('模板名称不能为空');
      return;
    }
    const payload = {
      templateName: formData.templateName.trim(),
      tag: formData.tag || '',
      purpose: formData.purpose || '',
      tone: formData.tone || '',
      outlineStructure: formData.outlineStructure
        ? JSON.stringify(formData.outlineStructure.split('\n').map(s => s.trim()).filter(Boolean))
        : '[]',
      status: Number(formData.status),
    };
    setSubmitting(true);
    try {
      if (editingTemplate) {
        await templateApi.updateTemplate(editingTemplate.id, payload);
        toast.success('模板更新成功');
      } else {
        await templateApi.addTemplate(payload);
        toast.success('模板创建成功');
      }
      setFormDrawerOpen(false);
      if (editingTemplate && selectedTemplate?.id === editingTemplate.id) {
        setDetailDrawerOpen(false);
        setSelectedTemplate(null);
      }
      await loadTemplates();
    } catch (e) {
      console.error('保存模板失败:', e);
      toast.error('操作失败: ' + (e.message || '保存模板失败'));
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Delete ----------
  const handleDelete = async (id) => {
    try {
      await templateApi.deleteTemplate(id);
      toast.success('模板已删除');
      if (selectedTemplate?.id === id) {
        setSelectedTemplate(null);
        setDetailDrawerOpen(false);
      }
      await loadTemplates();
    } catch (e) {
      console.error('删除模板失败:', e);
      toast.error('操作失败: ' + (e.message || '删除模板失败'));
    }
  };

  // ---------- Outline preview ----------
  const outlinePreview = (items, maxItems = 4) => {
    if (!items.length) return null;
    return (
      <div className="rounded-[var(--radius-md)] bg-accent/60 p-3">
        <p className="text-micro font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">
          大纲结构预览
        </p>
        <div className="space-y-1.5">
          {items.slice(0, maxItems).map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-muted-foreground/40 shrink-0" />
              <span className="text-label text-muted-foreground truncate">{item}</span>
            </div>
          ))}
          {items.length > maxItems && (
            <span className="text-micro text-muted-foreground/60 pl-3">
              +{items.length - maxItems} 更多章节
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 lg:p-8 page-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-page-title">模板管理</h1>
          <p className="text-page-desc">
            管理文章生成模板，定义大纲结构、语气风格和适用场景
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-[var(--radius-md)] overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-8 w-8 p-0 rounded-none', viewMode === 'grid' && 'bg-primary text-primary-foreground hover:bg-primary/90')}
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-8 w-8 p-0 rounded-none border-l', viewMode === 'list' && 'bg-primary text-primary-foreground hover:bg-primary/90')}
              onClick={() => setViewMode('list')}
            >
              <List size={14} />
            </Button>
          </div>
          <Button className="gap-1.5 btn-signal rounded-lg px-5 py-2.5 font-semibold" onClick={openCreateDrawer}>
            <Plus size={14} /> 新建模板
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-[var(--radius-md)]" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-16 w-full rounded-[var(--radius-md)]" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="surface-card text-center py-16">
          <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-body font-medium mb-1">暂无模板</p>
          <p className="text-helper text-muted-foreground">点击「新建模板」创建第一个模板</p>
        </div>
      ) : (
        <>
          {/* Grid View */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {templates.map((t, i) => {
                const outline = parseJsonField(t.outlineStructure);
                const tone = typeof t.tone === 'string' ? t.tone : '';
                const tagVariant = tagVariantMap[t.tag] || 'secondary';
                return (
                  <Card
                    key={t.id}
                    className={cn(
                      'cursor-pointer flex flex-col rounded-[var(--radius-xl)]',
                      'bg-card border-2 border-border hover:border-primary/30',
                      'shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)]',
                      'transition-all duration-200 enter-scale',
                    )}
                    style={{ '--enter-delay': `${i * 60}ms` }}
                    onClick={() => openDetail(t)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="h-10 w-10 rounded-[var(--radius-md)] bg-primary/8 flex items-center justify-center">
                            <FileText size={16} className="text-primary" />
                          </div>
                          <div>
                            <CardTitle className="text-body">{t.templateName}</CardTitle>
                            {t.tag && (
                              <Badge variant={tagVariant} className="text-micro mt-1 px-1.5">{t.tag}</Badge>
                            )}
                          </div>
                        </div>
                        <Badge variant={t.status === 1 ? 'success' : 'secondary'} className="text-micro">
                          {t.status === 1 ? '启用' : '停用'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-3">
                      {t.purpose && (
                        <p className="text-helper text-muted-foreground leading-relaxed line-clamp-2">{t.purpose}</p>
                      )}
                      {outlinePreview(outline)}
                      {tone && (
                        <div className="flex items-center gap-1.5">
                          <Mic2 size={12} className="text-muted-foreground" />
                          <span className="text-label text-muted-foreground">{tone}</span>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter className="pt-3 px-6 pb-4 border-t border-border/50 gap-1">
                      <Button
                        variant="ghost" size="sm"
                        className="text-label gap-1 h-8 "
                        onClick={(e) => { e.stopPropagation(); openEditDrawer(t); }}
                      >
                        <Edit3 size={12} /> 编辑
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="text-label gap-1 h-8 "
                        onClick={(e) => { e.stopPropagation(); openDetail(t); }}
                      >
                        <Eye size={12} /> 预览
                      </Button>
                      <div className="flex-1" />
                      <Button
                        variant="ghost" size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive transition-all duration-200"
                        onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}

          {/* List View */}
          {viewMode === 'list' && (
            <div className="bg-card border border-border rounded-[var(--radius-xl)] shadow-[var(--shadow-card)] overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-primary/5">
                    <TableHead className="min-w-[160px] text-center">模板名称</TableHead>
                    <TableHead className="min-w-[200px] text-center">用途说明</TableHead>
                    <TableHead className="w-[100px] whitespace-nowrap text-center">标签</TableHead>
                    <TableHead className="w-[140px] max-w-[200px] whitespace-nowrap text-center">语气风格</TableHead>
                    <TableHead className="w-[80px] whitespace-nowrap text-center">状态</TableHead>
                    <TableHead className="w-[120px] whitespace-nowrap text-center">创建时间</TableHead>
                    <TableHead className="w-[100px] whitespace-nowrap text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map(t => {
                    const outline = parseJsonField(t.outlineStructure);
                    const tone = typeof t.tone === 'string' ? t.tone : '';
                    const tagVariant = tagVariantMap[t.tag] || 'secondary';
                    return (
                      <TableRow key={t.id} className="cursor-pointer" onClick={() => openDetail(t)}>
                        <TableCell className="py-3">
                          <span className="text-body font-medium block truncate max-w-[200px]">{t.templateName}</span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-helper text-muted-foreground line-clamp-2 max-w-[260px] block">{t.purpose || '—'}</span>
                        </TableCell>
                        <TableCell className="py-3 whitespace-nowrap text-center">
                          {t.tag && <Badge variant={tagVariant} className="text-micro">{t.tag}</Badge>}
                        </TableCell>
                        <TableCell className="py-3 text-helper text-muted-foreground truncate max-w-[200px] whitespace-nowrap">{tone}</TableCell>
                        <TableCell className="py-3 whitespace-nowrap text-center">
                          <Badge variant={t.status === 1 ? 'success' : 'secondary'} className="text-micro">
                            {t.status === 1 ? '启用' : '停用'}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 text-helper text-muted-foreground whitespace-nowrap">
                          {t.createTime ? t.createTime.slice(0, 10) : ''}
                        </TableCell>
                        <TableCell className="py-3 whitespace-nowrap text-center">
                          <div className="flex gap-1 justify-center">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                              onClick={(e) => { e.stopPropagation(); openEditDrawer(t); }}>
                              <Edit3 size={13} />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}>
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* Pagination */}
      {!loading && templates.length > 0 && (
        <div className="mt-6">
          <Pagination page={page} totalPages={totalPages} total={total} onPageChange={(p) => { setPage(p); loadTemplates(p); }} />
        </div>
      )}

      {/* ========================
          Template Detail Drawer
         ======================== */}
      <Sheet open={detailDrawerOpen} onOpenChange={setDetailDrawerOpen}>
        <SheetContent>
          <SheetHeader className="mb-6">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-[var(--radius-md)] bg-primary/8 flex items-center justify-center">
                <FileText size={18} className="text-primary" />
              </div>
              <div>
                <SheetTitle>{selectedTemplate?.templateName}</SheetTitle>
                {selectedTemplate?.tag && (
                  <Badge variant={tagVariantMap[selectedTemplate.tag] || 'secondary'} className="mt-1 text-micro">
                    {selectedTemplate.tag}
                  </Badge>
                )}
              </div>
            </div>
            {selectedTemplate?.purpose && (
              <SheetDescription className="pt-1">{selectedTemplate.purpose}</SheetDescription>
            )}
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-260px)]">
            <div className="drawer-section">
              {/* Tone */}
              {selectedTemplate?.tone && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Mic2 size={14} className="text-muted-foreground" />
                    <span className="text-label text-muted-foreground uppercase tracking-wider">语气风格</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(typeof selectedTemplate.tone === 'string'
                      ? selectedTemplate.tone.split('、')
                      : parseJsonField(selectedTemplate.tone)
                    ).map((t, i) => (
                      <Badge key={i} variant="secondary">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Outline Structure */}
              {parseJsonField(selectedTemplate?.outlineStructure).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ListOrdered size={14} className="text-muted-foreground" />
                    <span className="text-label text-muted-foreground uppercase tracking-wider">大纲结构</span>
                  </div>
                  <Card>
                    <CardContent className="p-4">
                      {parseJsonField(selectedTemplate.outlineStructure).map((item, i, arr) => (
                        <div key={i} className={cn(
                          'flex items-center gap-3 py-2.5',
                          i < arr.length - 1 && 'border-b'
                        )}>
                          <span className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-label font-semibold text-primary shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-body font-medium">{item}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Status */}
              <div className="flex items-center gap-2">
                <span className="text-helper text-muted-foreground">状态：</span>
                <Badge variant={selectedTemplate?.status === 1 ? 'success' : 'secondary'}>
                  {selectedTemplate?.status === 1 ? '启用' : '停用'}
                </Badge>
                {selectedTemplate?.createTime && (
                  <>
                    <Separator orientation="vertical" className="h-4" />
                    <span className="text-helper text-muted-foreground">
                      创建于 {selectedTemplate.createTime.slice(0, 10)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </ScrollArea>

          <div className="mt-6 pt-4 border-t flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDetailDrawerOpen(false)}>关闭</Button>
            <Button
              className="gap-1.5"
              onClick={() => {
                setDetailDrawerOpen(false);
                if (selectedTemplate) openEditDrawer(selectedTemplate);
              }}
            >
              <Edit3 size={14} /> 编辑模板
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ========================
          Create / Edit Template Drawer
         ======================== */}
      <Sheet open={formDrawerOpen} onOpenChange={setFormDrawerOpen}>
        <SheetContent>
          <SheetHeader className="mb-6">
            <SheetTitle>{editingTemplate ? '编辑模板' : '新建模板'}</SheetTitle>
            <SheetDescription>
              {editingTemplate ? '修改模板的配置信息' : '创建一个新的文章生成模板'}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-260px)]">
            <div className="drawer-section">
              <div className="drawer-field">
                <label>模板名称 <span className="text-destructive">*</span></label>
                <Input
                  placeholder="例如：流感科普文章模板"
                  value={formData.templateName}
                  onChange={(e) => handleFormChange('templateName', e.target.value)}
                />
              </div>

              <div className="drawer-field">
                <label>标签分类</label>
                <Select
                  value={formData.tag || '_empty'}
                  onValueChange={(val) => handleFormChange('tag', val === '_empty' ? '' : val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择标签" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_empty">无标签</SelectItem>
                    {tagOptions.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="drawer-field">
                <label>用途说明</label>
                <Textarea
                  placeholder="描述该模板的适用场景和用途..."
                  value={formData.purpose}
                  onChange={(e) => handleFormChange('purpose', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="drawer-field">
                <label>语气风格</label>
                <Input
                  placeholder="例如：专业严谨,通俗易懂"
                  value={formData.tone}
                  onChange={(e) => handleFormChange('tone', e.target.value)}
                />
                <span className="helper">多个语气用逗号分隔</span>
              </div>

              <div className="drawer-field">
                <label>大纲结构</label>
                <Textarea
                  placeholder={"什么是流感\n传播途径\n预防措施\n疫苗接种"}
                  value={formData.outlineStructure}
                  onChange={(e) => handleFormChange('outlineStructure', e.target.value)}
                  rows={6}
                />
                <span className="helper">每行一个章节名称</span>
              </div>

              <div className="drawer-field">
                <label>状态</label>
                <Select
                  value={String(formData.status)}
                  onValueChange={(val) => handleFormChange('status', Number(val))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">启用</SelectItem>
                    <SelectItem value="0">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </ScrollArea>

          <div className="mt-6 pt-4 border-t flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormDrawerOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={handleFormSubmit} disabled={submitting} className="gap-1.5 min-w-[100px]">
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {editingTemplate ? '保存修改' : '创建模板'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
