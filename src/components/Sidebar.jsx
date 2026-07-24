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
  Workflow
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, user, onLogout, isDark, toggleTheme, isOpen, onClose }) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
    { id: 'inventario', label: 'Inventario', icon: Layers },
    { id: 'movimientos', label: 'Movimientos', icon: FileInput },
    { id: 'productos', label: 'Productos', icon: Package },
    { id: 'cables', label: 'Cable Schedule', icon: Cable },
    { id: 'consumos', label: 'Consumos (Campo)', icon: Activity },
    { id: 'recetas', label: 'BOM / Ensambles', icon: Workflow },
    { id: 'configuracion', label: 'Configuración', icon: Settings },
  ];

  return (
    <nav className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="nav-menu-container">
        <div className="sidebar-header">
          <h1>
            <img src="/favicon.svg" alt="Favicon" style={{ width: '20px', height: '20px' }} />
            <span>OT E&I - Materiales</span>
          </h1>
          <button onClick={onClose} className="sidebar-close-btn" aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>

        <ul className="nav-menu">
          {menuItems.map((item) => {
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
      </div>

      <div className="sidebar-footer">
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
