import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { FilePlus2, FileText, BookOpen, LayoutTemplate, Sun, Moon, Shield, Menu, X, ChevronLeft, Cpu } from 'lucide-react';
import { Button } from '../ui/button.jsx';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet.jsx';
import { Separator } from '../ui/separator.jsx';
import { ScrollArea } from '../ui/scroll-area.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.jsx';
import { cn } from '../../lib/utils.js';

const navItems = [
  { to: '/create', icon: FilePlus2, label: '新建文章' },
  { to: '/articles', icon: FileText, label: '文章列表' },
  { to: '/wiki', icon: BookOpen, label: 'Wiki 知识库' },
  { to: '/templates', icon: LayoutTemplate, label: '模板管理' },
  { to: '/llm-config', icon: Cpu, label: 'LLM 配置' },
];

export default function AppShell({ children, dark, setDark }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1400
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-collapse on medium screens
  useEffect(() => {
    if (windowWidth < 1280 && windowWidth >= 768) {
      setCollapsed(true);
    } else if (windowWidth >= 1280) {
      setCollapsed(false);
    }
  }, [windowWidth]);

  const isMobile = windowWidth < 768;

  const sidebarWidth = collapsed ? 'w-16' : 'w-[220px]';

  /* Sidebar content - shared between desktop and mobile sheet */
  const renderSidebarContent = (onNavClick) => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className={cn('flex items-center border-b border-sidebar-border px-4', collapsed ? 'justify-center py-4' : 'gap-3 pt-[4.25rem] pb-5 px-5')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary shadow-md shadow-primary/20 transition-shadow duration-300 hover:shadow-lg hover:shadow-primary/30">
          <Shield size={17} className="text-primary-foreground" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div className="animate-fade-in">
            <div className="text-[18px] font-bold tracking-tight text-sidebar-foreground">科普文章生成系统</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        {!collapsed && (
          <div className="mx-3 mb-3 rounded-md bg-sidebar-accent border border-sidebar-border px-3 py-2 text-[13px] font-semibold tracking-wide text-sidebar-foreground text-center">
            工作台
          </div>
        )}
        <TooltipProvider delayDuration={0}>
          <nav className={cn('flex flex-col items-center gap-2', collapsed ? 'px-2' : 'px-4')}>
            {navItems.map(({ to, icon: Icon, label }) => {
              const isActive = location.pathname === to || (to !== '/create' && location.pathname.startsWith(to));
              const linkContent = (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onNavClick}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] w-full',
                    'transition-all duration-200 ease-out',
                    isActive
                      ? 'bg-primary/20 text-sidebar-foreground font-bold border-l-[3px] border-primary'
                      : 'font-medium text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
                    collapsed && 'justify-center px-0 w-10 h-10'
                  )}
                >
                  <Icon size={17} strokeWidth={1.8} className="shrink-0" />
                  {!collapsed && label}
                </NavLink>
              );

              if (collapsed) {
                return (
                  <Tooltip key={to}>
                    <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
                  </Tooltip>
                );
              }
              return <div key={to} className="w-full">{linkContent}</div>;
            })}
          </nav>
        </TooltipProvider>
      </ScrollArea>

      {/* Bottom: Theme toggle + User */}
      <div className={cn('border-t border-sidebar-border p-3', collapsed && 'flex flex-col items-center')}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDark(!dark)}
          className={cn(
            'w-full justify-start gap-2 text-sidebar-muted rounded-lg',
            'hover:bg-sidebar-accent hover:text-sidebar-foreground',
            'transition-all duration-200',
            collapsed && 'justify-center px-0'
          )}
        >
          {dark ? <Sun size={14} strokeWidth={1.8} /> : <Moon size={14} strokeWidth={1.8} />}
          {!collapsed && (dark ? '浅色模式' : '深色模式')}
        </Button>
        {!collapsed && (
          <div className="mt-2 flex items-center gap-2 px-2">
            <div>
              <div className="text-[10px] text-sidebar-muted"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  /* Mobile: Sheet-based sidebar */
  if (isMobile) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        {/* Mobile header */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu size={18} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[220px] p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>导航菜单</SheetTitle>
              </SheetHeader>
              {renderSidebarContent(() => setSheetOpen(false))}
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Shield size={14} className="text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold">科普文章生成系统</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    );
  }

  /* Desktop / Medium: Fixed sidebar */
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className={cn('sidebar-transition shrink-0 overflow-hidden', sidebarWidth)}>
        {renderSidebarContent()}
      </aside>

      {/* Collapse toggle */}
      <div className="relative z-10 flex w-0 items-start pt-4">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full liquid-glass glass-border text-muted-foreground transition-all duration-200 hover:text-foreground hover:scale-110 active:scale-95',
          )}
        >
          <ChevronLeft size={12} className={cn('transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
