import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Products from './components/Products';
import Movements from './components/Movements';
import Inventory from './components/Inventory';
import Reports from './components/Reports';
import Config from './components/Config';

export default function App() {
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isDark, setIsDark] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Authenticated state listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitializing(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Theme preference listener
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    
    setIsDark(initialDark);
    if (initialDark) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }, []);

  // Toggle Theme helper
  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    localStorage.setItem('theme', nextDark ? 'dark' : 'light');
    if (nextDark) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setActiveTab('dashboard');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (initializing) {
    return (
      <div className="loading-container" style={{ width: '100vw', height: '100vh', background: 'var(--bg-app)' }}>
        <span className="spinner"></span>
        <span>Inicializando aplicación...</span>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  // Render view router based on tab selections
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'productos':
        return <Products />;
      case 'movimientos':
        return <Movements user={session.user} />;
      case 'inventario':
        return <Inventory />;
      case 'reportes':
        return <Reports />;
      case 'configuracion':
        return <Config />;
      default:
        return <Dashboard />;
    }
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Dashboard General';
      case 'productos': return 'Gestión de Productos';
      case 'movimientos': return 'Registro de Movimientos';
      case 'inventario': return 'Control de Inventario';
      case 'reportes': return 'Reportes y Análisis';
      case 'configuracion': return 'Configuración del Sistema';
      default: return 'Sistema de Inventario';
    }
  };

  return (
    <div className="app-container">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        user={session.user}
        onLogout={handleLogout}
        isDark={isDark}
        toggleTheme={toggleTheme}
      />
      <div className="main-content">
        <header className="content-header">
          <h2>{getTabTitle()}</h2>
        </header>
        <main className="content-body">
          {renderTabContent()}
        </main>
      </div>
    </div>
  );
}
