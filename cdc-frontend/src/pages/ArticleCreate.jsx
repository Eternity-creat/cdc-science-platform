import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  FileText, MessageSquareText, ArrowRight, ArrowLeft,
  CheckCircle2, Sparkles, Lightbulb, Bug, Pill, Users, MapPin,
  FileEdit, Type, Hash, Loader2, Search, X
} from 'lucide-react';
import { cn } from '../lib/utils.js';
import { Card, CardContent } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Input } from '../components/ui/input.jsx';
import { Separator } from '../components/ui/separator.jsx';
import { Textarea } from '../components/ui/textarea.jsx';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from '../components/ui/select.jsx';
import * as articleApi from '../api/article.js';

export default function ArticleCreate() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('form');
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    entityType: '',
    entityId: '',
    populationId: '',
    sceneId: '',
    templateId: '',
    wordCount: 800,
  });
  const [freeText, setFreeText] = useState('');
  const [freeTextTemplateId, setFreeTextTemplateId] = useState('');
  const [parsed, setParsed] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  /* Dropdown data from backend */
  const [dropdown, setDropdown] = useState({
    diseaseList: [],
    vaccineList: [],
    populationList: [],
    sceneList: [],
    templateList: [],
  });
  const [loadingDropdown, setLoadingDropdown] = useState(true);

  /* Search & filter state for entity tag grids */
  const [entitySearch, setEntitySearch] = useState('');
  const [popSearch, setPopSearch] = useState('');
  const [sceneSearch, setSceneSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await articleApi.getFormDropdown();
        if (!cancelled) setDropdown(data || {});
      } catch (e) {
        console.error('加载下拉数据失败:', e);
      } finally {
        if (!cancelled) setLoadingDropdown(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const entityList = formData.entityType === 'vaccine'
    ? (dropdown.vaccineList || [])
    : (dropdown.diseaseList || []);

  /* Filtered entity list for Step 2 (only selected type + search) */
  const filteredEntityList = useMemo(() => {
    if (!entitySearch.trim()) return entityList;
    const q = entitySearch.trim().toLowerCase();
    return entityList.filter(e => e.stdName?.toLowerCase().includes(q));
  }, [entityList, entitySearch]);

  /* Filtered population & scene lists for Step 3 */
  const filteredPopulations = useMemo(() => {
    const list = dropdown.populationList || [];
    if (!popSearch.trim()) return list;
    const q = popSearch.trim().toLowerCase();
    return list.filter(p => p.stdName?.toLowerCase().includes(q));
  }, [dropdown.populationList, popSearch]);

  const filteredScenes = useMemo(() => {
    const list = dropdown.sceneList || [];
    if (!sceneSearch.trim()) return list;
    const q = sceneSearch.trim().toLowerCase();
    return list.filter(s => s.stdName?.toLowerCase().includes(q));
  }, [dropdown.sceneList, sceneSearch]);

  const steps = [
    { num: 1, label: '选择类型' },
    { num: 2, label: '选择实体' },
    { num: 3, label: '人群与场景' },
    { num: 4, label: '模板设置' },
  ];

  const handleParse = async () => {
    /* FE-3 fix: 调用后端 parse-intent 接口进行智能解析 */
    if (!freeText.trim()) {
      toast.error('请输入文章需求描述');
      return;
    }
    setSubmitting(true);
    try {
      const parsed = await articleApi.parseIntent(freeText);
      setParsed({ userText: freeText, templateId: freeTextTemplateId, ...parsed });
      toast.success('智能解析完成');
    } catch (e) {
      console.error('智能解析失败:', e);
      // Fallback: use local parsing
      setParsed({ userText: freeText, templateId: freeTextTemplateId });
      toast.error('智能解析失败，已使用本地解析', { description: e.message || '' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitForm = async () => {
    // FE-2 fix: 表单校验
    if (!formData.entityType) {
      toast.error('请先选择实体类型（疾病/疫苗）');
      setStep(1);
      return;
    }
    if (!formData.entityId) {
      toast.error('请先选择具体实体');
      setStep(2);
      return;
    }
    if (!formData.templateId) {
      toast.error('请先选择模板');
      setStep(4);
      return;
    }
    setSubmitting(true);
    try {
      const result = await articleApi.createArticle({
        mode: 1,
        entityType: formData.entityType === 'disease' ? 1 : 2,
        entityId: formData.entityId,
        populationId: formData.populationId,
        sceneId: formData.sceneId,
        templateId: formData.templateId,
        wordCount: formData.wordCount,
      });
      if (result && result.articleId) {
        navigate(`/article/${result.articleId}`);
      }
    } catch (e) {
      console.error('创建文章失败:', e);
      toast.error('创建文章失败', { description: e.message || '请重试' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitText = async () => {
    if (!freeText.trim()) {
      toast.error('请输入文章需求描述');
      return;
    }
    setSubmitting(true);
    try {
      const result = await articleApi.generateFromText(freeText, parseInt(freeTextTemplateId) || 1);
      if (result && result.articleId) {
        navigate(`/article/${result.articleId}`);
      }
    } catch (e) {
      console.error('创建文章失败:', e);
      toast.error('创建文章失败', { description: e.message || '请重试' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-8 page-enter">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-page-title">创建科普文章</h1>
        <p className="text-page-desc">
          选择输入方式，填写基本信息后系统将自动生成文章大纲和初稿
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        <Card
          className={cn(
            'cursor-pointer border-2 transition-all duration-200 enter-scale hover:shadow-[var(--shadow-elevated)] hover:scale-[1.01] active:scale-[0.99]',
            mode === 'form'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground/30'
          )}
          style={{ '--enter-delay': '0ms' }}
          onClick={() => setMode('form')}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2.5 mb-1.5">
              <FileEdit
                className={cn(
                  'h-5 w-5 transition-transform duration-200',
                  mode === 'form' ? 'text-primary scale-110' : 'text-muted-foreground'
                )}
              />
              <span
                className={cn(
                  'text-body font-semibold',
                  mode === 'form' ? 'text-primary' : 'text-foreground'
                )}
              >
                结构化表单
              </span>
            </div>
            <p className="text-helper text-muted-foreground">
              逐步选择疾病、人群、模板等参数，适合精确控制
            </p>
          </CardContent>
        </Card>
        <Card
          className={cn(
            'cursor-pointer border-2 transition-all duration-200 enter-scale hover:shadow-[var(--shadow-elevated)] hover:scale-[1.01] active:scale-[0.99]',
            mode === 'text'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground/30'
          )}
          style={{ '--enter-delay': '80ms' }}
          onClick={() => setMode('text')}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2.5 mb-1.5">
              <MessageSquareText
                className={cn(
                  'h-5 w-5 transition-transform duration-200',
                  mode === 'text' ? 'text-primary scale-110' : 'text-muted-foreground'
                )}
              />
              <span
                className={cn(
                  'text-body font-semibold',
                  mode === 'text' ? 'text-primary' : 'text-foreground'
                )}
              >
                自由文本
              </span>
            </div>
            <p className="text-helper text-muted-foreground">
              输入自然语言描述，系统自动解析意图并填充参数
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Form Mode */}
      {mode === 'form' && (
        <div>
          {/* Step Indicator */}
          <div className="flex items-center mb-8 enter" style={{ '--enter-delay': '160ms' }}>
            {steps.map((s, i) => (
              <div key={s.num} className="flex items-center flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300',
                      step >= s.num
                        ? 'bg-primary text-primary-foreground scale-105'
                        : 'bg-accent/60 text-muted-foreground'
                    )}
                  >
                    {step > s.num ? <CheckCircle2 className="h-4 w-4" /> : s.num}
                  </div>
                  <span
                    className={cn(
                      'text-helper font-medium transition-colors duration-300',
                      step >= s.num ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-px mx-2 transition-colors duration-500',
                      step > s.num ? 'bg-primary' : 'bg-border'
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step Content */}
          <Card className="min-h-[240px] enter" style={{ '--enter-delay': '200ms' }}>
            <CardContent className="p-6">
              {/* Step 1: Entity Type */}
              {step === 1 && (
                <div className="text-center">
                  <h3 className="text-section-title font-semibold mb-1">选择实体类型</h3>
                  <p className="text-body text-muted-foreground mb-6">
                    选择您要撰写科普文章的主题类型
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
                    {[
                      { value: 'disease', label: '疾病', icon: Bug, desc: '流感、新冠、手足口病等' },
                      { value: 'vaccine', label: '疫苗', icon: Pill, desc: '流感疫苗、HPV疫苗等' },
                    ].map(({ value, label, icon: Icon, desc }, idx) => (
                      <Card
                        key={value}
                        className={cn(
                          'cursor-pointer border-2 transition-all duration-200 enter-scale hover:shadow-[var(--shadow-elevated)] hover:scale-[1.02] active:scale-[0.98]',
                          formData.entityType === value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-muted-foreground/30'
                        )}
                        style={{ '--enter-delay': `${idx * 80}ms` }}
                        onClick={() =>
                          setFormData({ ...formData, entityType: value, entityId: '' })
                        }
                      >
                        <CardContent className="p-6 flex flex-col items-center">
                          <Icon
                            className={cn(
                              'h-6 w-6 transition-transform duration-200',
                              formData.entityType === value
                                ? 'text-primary scale-110'
                                : 'text-muted-foreground'
                            )}
                            strokeWidth={1.5}
                          />
                          <div className="mt-3 text-body font-semibold">{label}</div>
                          <div className="mt-1.5 text-sm text-muted-foreground">{desc}</div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Entity Selection */}
              {step === 2 && (
                <div>
                  <h3 className="text-section-title font-semibold mb-1 text-center">
                    选择具体{formData.entityType === 'disease' ? '疾病' : '疫苗'}
                  </h3>
                  <p className="text-body text-muted-foreground mb-5 text-center">
                    从知识库中选择目标实体，支持搜索过滤
                  </p>

                  {/* Search */}
                  <div className="relative max-w-md mx-auto mb-5">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="搜索实体名称..."
                      value={entitySearch}
                      onChange={e => setEntitySearch(e.target.value)}
                      className="pl-9 pr-9 h-10"
                    />
                    {entitySearch && (
                      <button
                        type="button"
                        onClick={() => setEntitySearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-accent transition-colors"
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>

                  {/* Tag Grid */}
                  {filteredEntityList.length > 0 ? (
                    <div className="max-w-xl mx-auto mb-5 rounded-[var(--radius-md)] border border-border bg-card/50 p-3 max-h-[280px] overflow-y-auto">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {filteredEntityList.map((entity, idx) => (
                          <Badge
                            key={entity.id}
                            variant={formData.entityId === entity.id ? 'default' : 'outline'}
                            className={cn(
                              'cursor-pointer transition-all duration-200 text-sm px-3 py-2 justify-center text-center whitespace-normal leading-snug h-auto enter-scale',
                              formData.entityId !== entity.id &&
                                'hover:bg-accent hover:text-accent-foreground'
                            )}
                            style={{ '--enter-delay': `${idx * 30}ms` }}
                            onClick={() =>
                              setFormData({ ...formData, entityId: entity.id })
                            }
                            title={entity.stdName}
                          >
                            {entity.stdName}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : !loadingDropdown ? (
                    <div className="text-center py-8 mb-5">
                      <Search className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-body text-muted-foreground">
                        {entitySearch ? '未找到匹配的实体' : '暂无数据，请先在 Wiki 知识库中添加实体'}
                      </p>
                    </div>
                  ) : null}

                  {/* Result count */}
                  {filteredEntityList.length > 0 && (
                    <p className="text-helper text-muted-foreground text-center mb-4">
                      共 {filteredEntityList.length} 项{entitySearch ? `匹配 "${entitySearch}"` : ''}
                    </p>
                  )}

                  {formData.entityId && (
                    <div className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-accent/50 p-3.5 text-body text-muted-foreground max-w-md mx-auto enter" style={{ '--enter-delay': '200ms' }}>
                      <Lightbulb className="h-4 w-4 text-[hsl(var(--warning))] shrink-0" />
                      <span>
                        已选择{' '}
                        <span className="font-semibold text-foreground">
                          {entityList.find(e => e.id === formData.entityId)?.stdName}
                        </span>
                        ，系统将自动加载相关知识库内容
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Population & Scene */}
              {step === 3 && (
                <div>
                  <h3 className="text-section-title font-semibold mb-1 text-center">选择目标人群与场景</h3>
                  <p className="text-body text-muted-foreground mb-6 text-center">
                    分别选择文章面向的目标人群和使用场景
                  </p>

                  {/* Population */}
                  <div className="mb-8 enter" style={{ '--enter-delay': '0ms' }}>
                    <div className="flex items-center gap-2 mb-3 max-w-xl mx-auto">
                      <Users className="h-4.5 w-4.5 text-primary shrink-0" />
                      <span className="text-body font-semibold">目标人群</span>
                    </div>
                    <div className="relative max-w-md mx-auto mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="搜索人群..."
                        value={popSearch}
                        onChange={e => setPopSearch(e.target.value)}
                        className="pl-9 pr-9 h-10"
                      />
                      {popSearch && (
                        <button
                          type="button"
                          onClick={() => setPopSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-accent transition-colors"
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                    {filteredPopulations.length > 0 ? (
                      <div className="max-w-xl mx-auto rounded-[var(--radius-md)] border border-border bg-card/50 p-3 max-h-[220px] overflow-y-auto">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {filteredPopulations.map((p, idx) => (
                            <Badge
                              key={p.id}
                              variant={formData.populationId === p.id ? 'default' : 'outline'}
                              className={cn(
                                'cursor-pointer transition-all duration-200 text-sm px-3 py-2 justify-center text-center whitespace-normal leading-snug h-auto enter-scale',
                                formData.populationId !== p.id &&
                                  'hover:bg-accent hover:text-accent-foreground'
                              )}
                              style={{ '--enter-delay': `${idx * 30}ms` }}
                              onClick={() =>
                                setFormData({ ...formData, populationId: p.id })
                              }
                              title={p.stdName}
                            >
                              {p.stdName}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-body text-muted-foreground text-center py-4">
                        {popSearch ? '未找到匹配的人群' : '暂无人群数据'}
                      </p>
                    )}
                  </div>

                  <Separator className="max-w-xl mx-auto mb-8" />

                  {/* Scene */}
                  <div className="enter" style={{ '--enter-delay': '150ms' }}>
                    <div className="flex items-center gap-2 mb-3 max-w-xl mx-auto">
                      <MapPin className="h-4.5 w-4.5 text-primary shrink-0" />
                      <span className="text-body font-semibold">使用场景</span>
                    </div>
                    <div className="relative max-w-md mx-auto mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="搜索场景..."
                        value={sceneSearch}
                        onChange={e => setSceneSearch(e.target.value)}
                        className="pl-9 pr-9 h-10"
                      />
                      {sceneSearch && (
                        <button
                          type="button"
                          onClick={() => setSceneSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-accent transition-colors"
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                    {filteredScenes.length > 0 ? (
                      <div className="max-w-xl mx-auto rounded-[var(--radius-md)] border border-border bg-card/50 p-3 max-h-[220px] overflow-y-auto">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {filteredScenes.map((s, idx) => (
                            <Badge
                              key={s.id}
                              variant={formData.sceneId === s.id ? 'default' : 'outline'}
                              className={cn(
                                'cursor-pointer transition-all duration-200 text-sm px-3 py-2 justify-center text-center whitespace-normal leading-snug h-auto enter-scale',
                                formData.sceneId !== s.id &&
                                  'hover:bg-accent hover:text-accent-foreground'
                              )}
                              style={{ '--enter-delay': `${idx * 30}ms` }}
                              onClick={() =>
                                setFormData({ ...formData, sceneId: s.id })
                              }
                              title={s.stdName}
                            >
                              {s.stdName}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-body text-muted-foreground text-center py-4">
                        {sceneSearch ? '未找到匹配的场景' : '暂无场景数据'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Step 4: Template & Word Count */}
              {step === 4 && (
                <div className="text-center">
                  <h3 className="text-section-title font-semibold mb-4">选择模板与字数</h3>

                  {/* Template List */}
                  <div className="space-y-2.5 mb-6 max-w-lg mx-auto">
                    {(dropdown.templateList || []).map((t, idx) => (
                      <Card
                        key={t.id}
                        className={cn(
                          'cursor-pointer border transition-all duration-200 enter-scale hover:shadow-[var(--shadow-elevated)] hover:scale-[1.01] active:scale-[0.99]',
                          formData.templateId === t.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-muted-foreground/30'
                        )}
                        style={{ '--enter-delay': `${idx * 60}ms` }}
                        onClick={() =>
                          setFormData({ ...formData, templateId: t.id })
                        }
                      >
                        <CardContent className="p-4 flex items-center justify-between">
                          <div className="text-left">
                            <div className="text-body font-semibold">
                              {t.templateName}
                            </div>
                            <div className="text-sm text-muted-foreground mt-0.5">
                              {t.purpose}
                            </div>
                          </div>
                          {formData.templateId === t.id && (
                            <CheckCircle2 className="h-5 w-5 text-primary shrink-0 transition-transform duration-200 scale-110" />
                          )}
                        </CardContent>
                      </Card>
                    ))}
                    {(dropdown.templateList || []).length === 0 &&
                      !loadingDropdown && (
                        <span className="text-body text-muted-foreground">
                          暂无模板，请先在模板管理中添加
                        </span>
                      )}
                  </div>

                  <Separator className="mb-6 max-w-lg mx-auto" />

                  {/* Word Count */}
                  <div className="max-w-lg mx-auto">
                    <label className="flex items-center justify-center gap-1.5 text-helper text-muted-foreground mb-3">
                      <Hash className="h-4 w-4" />
                      目标字数
                    </label>
                    <div className="flex flex-wrap justify-center gap-2.5">
                      {[600, 800, 1000, 1200, 1500].map((w, idx) => (
                        <Badge
                          key={w}
                          variant={formData.wordCount === w ? 'default' : 'outline'}
                          className={cn(
                            'cursor-pointer transition-all duration-200 text-sm px-3.5 py-1 enter-scale',
                            formData.wordCount !== w &&
                              'hover:bg-accent hover:text-accent-foreground'
                          )}
                          style={{ '--enter-delay': `${idx * 50}ms` }}
                          onClick={() =>
                            setFormData({ ...formData, wordCount: w })
                          }
                        >
                          {w}字
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step Navigation */}
          <div className="flex justify-between mt-5 enter" style={{ '--enter-delay': '280ms' }}>
            <Button
              variant="ghost"
              className={cn('gap-1 ', step <= 1 && 'invisible')}
              onClick={() => step > 1 && setStep(step - 1)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              上一步
            </Button>
            {step < 4 ? (
              <Button className="gap-1 " onClick={() => {
                // FE-2 fix: 步骤校验
                if (step === 1 && !formData.entityType) {
                  toast.error('请先选择实体类型');
                  return;
                }
                if (step === 2 && !formData.entityId) {
                  toast.error('请先选择具体实体');
                  return;
                }
                setStep(step + 1);
              }}>
                下一步
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                className="gap-1.5 "
                onClick={handleSubmitForm}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                开始生成
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Text Mode */}
      {mode === 'text' && (
        <div className="enter" style={{ '--enter-delay': '160ms' }}>
          <div className="space-y-2.5 mb-5">
            <label className="flex items-center gap-1.5 text-helper text-muted-foreground">
              <Type className="h-4 w-4" />
              描述您的文章需求
            </label>
            <Textarea
              rows={6}
              value={freeText}
              onChange={e => setFreeText(e.target.value)}
              placeholder="例如：请帮我写一篇关于流感的科普文章，面向全人群，主要介绍流感的传播途径、预防措施和疫苗接种的重要性，大约1200字左右..."
            />
          </div>

          <div className="flex gap-2 mb-6">
            <Select
              value={freeTextTemplateId}
              onValueChange={setFreeTextTemplateId}
            >
              <SelectTrigger className="w-auto min-w-[180px]">
                <SelectValue placeholder="选择模板（可选）" />
              </SelectTrigger>
              <SelectContent>
                {(dropdown.templateList || []).map(t => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.templateName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="gap-1.5 " onClick={handleParse} disabled={!freeText}>
              <Sparkles className="h-3.5 w-3.5" />
              智能解析
            </Button>
          </div>

          {parsed && (
            <Card className="border-primary mb-5 enter-scale" style={{ '--enter-delay': '0ms' }}>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" />
                  <span className="text-body font-semibold">
                    解析完成，确认后将提交生成
                  </span>
                </div>
                <div className="rounded-[var(--radius-md)] bg-accent/50 p-3 text-body leading-relaxed text-muted-foreground">
                  {parsed.userText}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    className="gap-1.5 "
                    onClick={handleSubmitText}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    确认并生成
                  </Button>
                  <Button variant="ghost" onClick={() => setParsed(null)}>
                    修改参数
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
