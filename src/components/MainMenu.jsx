import React, { useState } from 'react';
import { Box, Cable, MonitorDot, User, LogOut, Sun, Moon } from 'lucide-react';

export default function MainMenu({ onSelectModule, user, onLogout, isDark, toggleTheme }) {
  const [hoveredModule, setHoveredModule] = useState(null);
  
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
        <div className="main-menu-grid">
          {menuItems.map(item => {
            const IconComponent = item.icon;
            return (
              <div
                key={item.id}
                className="main-menu-card"
                onClick={() => onSelectModule(item.id, item.defaultTab)}
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
      </div>
    </div>
  );
}
