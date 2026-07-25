import React from 'react';
import {
  BarChart2,
  PlusCircle,
  FileInput,
  Layers,
  FileText,
  Settings,
  User,
  LogOut,
  Sun,
  Moon,
  Package,
  X,
  Cable,
  Activity,
  Workflow,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Box,
  MonitorDot,
  Zap
} from 'lucide-react';

export default function Sidebar({ activeModule, setActiveModule, activeTab, setActiveTab, user, onLogout, isDark, toggleTheme, isOpen, onClose }) {
  const modules = [
    {
      id: 'material',
      label: 'Material',
      icon: Box,
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
        { id: 'consumos', label: 'Reportes', icon: Layers },
        { id: 'movimientos', label: 'Movimientos', icon: FileInput },
        { id: 'productos', label: 'Productos', icon: Package },
        { id: 'recetas', label: 'BOM / Ensambles', icon: Workflow },
        { id: 'material_config', label: 'Configuración', icon: Settings },
      ]
    },
    {
      id: 'cable',
      label: 'Cable Scheduling',
      icon: Cable,
      items: [
        { id: 'cables', label: 'Circuitos', icon: Cable },
        { id: 'cables_pat', label: 'Puesta a Tierra', icon: Zap },
      ]
    },
    {
      id: 'system_config',
      label: 'Configuración',
      icon: MonitorDot,
      items: [
        { id: 'system_config', label: 'Sistema y Seguridad', icon: Settings },
      ]
    }
  ];

  return (
    <nav className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="nav-menu-container">
        <div className="sidebar-header">
          <h1>
            <img src="/favicon.svg" alt="Favicon" style={{ width: '20px', height: '20px' }} />
            <span>OT E&I - Sistema</span>
          </h1>
          <button onClick={onClose} className="sidebar-close-btn" aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>

        <div className="nav-modules">
          {modules.filter(m => !activeModule || m.id === activeModule).map((mod) => {
            const isModuleActive = activeModule === mod.id;
            const ModuleIcon = mod.icon;

            return (
              <div key={mod.id} className="nav-module-group" style={{ marginBottom: '8px' }}>
                <div
                  className={`nav-module-header ${isModuleActive ? 'active' : ''}`}
                  onClick={() => {
                    if (!isModuleActive) {
                      setActiveModule(mod.id);
                      if (mod.items.length > 0) {
                        setActiveTab(mod.items[0].id);
                      }
                    } else {
                      // Clicking the active header again goes back to main menu
                      setActiveModule(null);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    background: isModuleActive ? 'var(--primary-light, rgba(59, 130, 246, 0.1))' : 'transparent',
                    color: isModuleActive ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: isModuleActive ? '600' : '500',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <ModuleIcon size={18} />
                    <span>{mod.label}</span>
                  </div>
                </div>

                {isModuleActive && (
                  <ul className="nav-menu" style={{ marginTop: '4px', paddingLeft: '12px' }}>
                    {mod.items.map((item) => {
                      const IconComponent = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <li className="nav-item" key={item.id}>
                          <a
                            className={`nav-link ${isActive ? 'active' : ''}`}
                            onClick={() => {
                              setActiveTab(item.id);
                              if (onClose) onClose();
                            }}
                          >
                            <IconComponent size={18} />
                            <span>{item.label}</span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="sidebar-footer">
        {activeModule && (
          <button
            className="sidebar-fab"
            onClick={() => setActiveModule(null)}
            title="Volver al Menú Principal"
          >
            <div className="fab-icon"><ChevronLeft size={20} /></div>
            <div className="fab-text">Menú Principal</div>
          </button>
        )}

        {user && (
          <div className="user-profile-card" style={{ marginBottom: '12px' }}>
            <div className="user-info">
              <span className="user-avatar">
                <User size={18} />
              </span>
              <span className="user-email" title={user.email}>
                {user.email}
              </span>
            </div>
            <button
              type="button"
              className="btn-logout"
              onClick={onLogout}
              title="Cerrar Sesión"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}

        <button onClick={toggleTheme} className="theme-btn">
          {isDark ? (
            <>
              <Sun size={16} />
              <span>Modo Claro</span>
            </>
          ) : (
            <>
              <Moon size={16} />
              <span>Modo Oscuro</span>
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
