import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import AppShell from './components/layout/AppShell.jsx';
import Workbench from './pages/Workbench.jsx';
import ArticleCreate from './pages/ArticleCreate.jsx';
import ArticleList from './pages/ArticleList.jsx';
import WikiManagement from './pages/WikiManagement.jsx';
import TemplateManagement from './pages/TemplateManagement.jsx';
import LlmConfigManagement from './pages/LlmConfigManagement.jsx';

export default function App() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return (
    <AppShell dark={dark} setDark={setDark}>
      <Routes>
        <Route path="/" element={<Navigate to="/articles" replace />} />
        <Route path="/create" element={<ArticleCreate />} />
        <Route path="/articles" element={<ArticleList />} />
        <Route path="/article/:id" element={<Workbench />} />
        <Route path="/wiki" element={<WikiManagement />} />
        <Route path="/templates" element={<TemplateManagement />} />
        <Route path="/llm-config" element={<LlmConfigManagement />} />
      </Routes>
      <Toaster
        position="top-right"
        theme={dark ? 'dark' : 'light'}
        toastOptions={{
          style: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' },
        }}
      />
    </AppShell>
  );
}
