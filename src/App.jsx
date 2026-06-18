import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Products from './components/Products';
import Movements from './components/Movements';
import Inventory from './components/Inventory';
import Reports from './components/Reports';
import Config from './components/Config';
import { Clock, Menu } from 'lucide-react';

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const WARNING_BEFORE_MS = 60 * 1000; // Show warning 1 minute before logout

export default function App() {
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isDark, setIsDark] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const inactivityTimer = useRef(null);
  const warningTimer = useRef(null);

  // Reset the inactivity timer on user activity
  const resetInactivityTimer = useCallback(() => {
    setShowTimeoutWarning(false);

    if (warningTimer.current) clearTimeout(warningTimer.current);
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);

    // Show warning before timeout
    warningTimer.current = setTimeout(() => {
      setShowTimeoutWarning(true);
    }, INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS);

    // Auto-logout on timeout
    inactivityTimer.current = setTimeout(async () => {
      setShowTimeoutWarning(false);
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.error('Auto-logout error:', err);
      }
    }, INACTIVITY_TIMEOUT_MS);
  }, []);

  // Set up activity listeners when session is active
  useEffect(() => {
    if (!session) return;

    const activityEvents = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'];
    const handler = () => resetInactivityTimer();

    activityEvents.forEach(evt => document.addEventListener(evt, handler, { passive: true }));
    resetInactivityTimer();

    return () => {
      activityEvents.forEach(evt => document.removeEventListener(evt, handler));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      if (warningTimer.current) clearTimeout(warningTimer.current);
    };
  }, [session, resetInactivityTimer]);

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
      case 'reportes': return 'Reportes';
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
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />
      {isMobileSidebarOpen && (
        <div 
          className="sidebar-overlay" 
          onClick={() => setIsMobileSidebarOpen(false)}
        ></div>
      )}
      <div className="main-content">
        <header className="content-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              className="sidebar-toggle-btn" 
              onClick={() => setIsMobileSidebarOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={20} />
            </button>
            <h2>{getTabTitle()}</h2>
          </div>
        </header>

        {showTimeoutWarning && (
          <div className="message warning" style={{ 
            margin: '0 24px 16px 24px',
            animation: 'fadeIn 0.3s ease'
          }}>
            <Clock size={16} />
            <span><strong>Aviso:</strong> Su sesión se cerrará automáticamente en 1 minuto por inactividad. Mueva el mouse o presione una tecla para continuar.</span>
          </div>
        )}

        <main className="content-body">
          {renderTabContent()}
        </main>
      </div>
    </div>
  );
}
