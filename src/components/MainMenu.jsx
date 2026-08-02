import React, { useState } from 'react';
import { Box, Cable, MonitorDot, User, LogOut, Sun, Moon, Zap, ChevronLeft } from 'lucide-react';
import ProjectAreaSelector from './ProjectAreaSelector';

export default function MainMenu({ onSelectModule, user, onLogout, isDark, toggleTheme }) {
  const [hoveredModule, setHoveredModule] = useState(null);
  const [showCableSubmenu, setShowCableSubmenu] = useState(false);
  
  const menuItems = [
    {
      id: 'material',
      label: 'Materiales',
      description: 'Control de productos, movimientos de almacén, balance de consumo y gestor de recetas/ensambles (BOM).',
      icon: Box,
      defaultTab: 'dashboard',
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
      glowColor: 'rgba(59, 130, 246, 0.4)'
    },
    {
      id: 'cable',
      label: 'Cable Scheduling',
      description: 'Administración del Cable Schedule, control de tendido de circuitos de fuerza/control y conductores de Puesta a Tierra (PAT).',
      icon: Cable,
      defaultTab: 'cables',
      gradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
      glowColor: 'rgba(16, 185, 129, 0.4)'
    },
    {
      id: 'system_config',
      label: 'Configuración',
      description: 'Configuración global de parámetros de la base de datos, seguridad, roles de usuario e historial de auditoría.',
      icon: MonitorDot,
      defaultTab: 'system_config',
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
      glowColor: 'rgba(139, 92, 246, 0.4)'
    }
  ];

  return (
    <div className={`main-menu-view glow-${hoveredModule || 'none'}`}>
      {/* Background Ambient Glow backdrop */}
      <div className="main-menu-backdrop" />

      {/* Premium Main Header Bar */}
      <header className="main-menu-header">
        <div className="main-menu-brand">
          <img src="/favicon.svg" alt="Logo" style={{ width: '28px', height: '28px' }} />
          <span>OT E&I</span>
        </div>
        
        <div className="main-menu-user-actions">
          <ProjectAreaSelector onAreaChange={() => setShowCableSubmenu(false)} />

          <button onClick={toggleTheme} className="theme-toggle-btn" title={isDark ? "Modo Claro" : "Modo Oscuro"}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          
          <button onClick={onLogout} className="logout-btn" title="Cerrar Sesión">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Grid containing cards */}
      <div className="main-menu-content">
        {showCableSubmenu ? (
          <div className="submenu-container" style={{ animation: 'slideUp 0.25s ease-out', width: '100%', maxWidth: '800px', margin: '0 auto' }}>
            <button 
              className="btn btn-secondary btn-sm submenu-back-btn" 
              onClick={() => setShowCableSubmenu(false)}
              style={{ 
                marginBottom: '20px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '8px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-primary)'
              }}
            >
              <ChevronLeft size={16} />
              <span>Volver a Módulos</span>
            </button>
            <h2 className="submenu-title" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '24px', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left' }}>
              Cable Scheduling
            </h2>
            <div className="main-menu-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <div
                className="main-menu-card"
                onClick={() => onSelectModule('cable', 'cables')}
                onMouseEnter={() => setHoveredModule('cable')}
                onMouseLeave={() => setHoveredModule(null)}
                style={{
                  '--glow-color': 'rgba(16, 185, 129, 0.4)'
                }}
              >
                <div 
                  className="main-menu-card-icon-wrapper"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                >
                  <Cable size={36} color="#fff" />
                </div>
                <h3 className="main-menu-card-title">Circuitos</h3>
                <p className="main-menu-card-desc">Control de tendido, estados y metrados de circuitos de fuerza y control.</p>
              </div>
              <div
                className="main-menu-card"
                onClick={() => onSelectModule('cable', 'cables_pat')}
                onMouseEnter={() => setHoveredModule('cable')}
                onMouseLeave={() => setHoveredModule(null)}
                style={{
                  '--glow-color': 'rgba(5, 150, 105, 0.4)'
                }}
              >
                <div 
                  className="main-menu-card-icon-wrapper"
                  style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}
                >
                  <Zap size={36} color="#fff" />
                </div>
                <h3 className="main-menu-card-title">Puesta a Tierra (PAT)</h3>
                <p className="main-menu-card-desc">Seguimiento de conductores desnudos, electrodos y conexiones a tierra.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="main-menu-grid">
            {menuItems.map(item => {
              const IconComponent = item.icon;
              return (
                <div
                  key={item.id}
                  className="main-menu-card"
                  onClick={() => {
                    if (item.id === 'cable') {
                      setShowCableSubmenu(true);
                    } else {
                      onSelectModule(item.id, item.defaultTab);
                    }
                  }}
                  onMouseEnter={() => setHoveredModule(item.id)}
                  onMouseLeave={() => setHoveredModule(null)}
                  style={{
                    '--glow-color': item.glowColor
                  }}
                >
                  <div 
                    className="main-menu-card-icon-wrapper"
                    style={{ background: item.gradient }}
                  >
                    <IconComponent size={36} color="#fff" />
                  </div>
                  <h3 className="main-menu-card-title">{item.label}</h3>
                  <p className="main-menu-card-desc">{item.description}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
