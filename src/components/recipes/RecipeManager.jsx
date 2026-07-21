import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { Plus, Trash2, Search, Settings, Save, AlertCircle } from 'lucide-react';

export default function RecipeManager() {
  const [products, setProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Selection state
  const [selectedParent, setSelectedParent] = useState(null);
  const [parentSearch, setParentSearch] = useState('');
  
  // New Component state
  const [newComponent, setNewComponent] = useState('');
  const [newMultiplier, setNewMultiplier] = useState('');
  const [compSearch, setCompSearch] = useState('');

  const fetchData = async () => {
    setLoading(true);
    const [prodRes, recRes] = await Promise.all([
      supabase.from('productos').select('codigo, nombre').order('nombre'),
      supabase.from('producto_recetas').select('id, parent_codigo, componente_codigo, multiplicador')
    ]);
    
    if (prodRes.data) setProducts(prodRes.data);
    if (recRes.data) setRecipes(recRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddComponent = async () => {
    if (!selectedParent || !newComponent || !newMultiplier) return;
    
    const mult = parseFloat(newMultiplier);
    if (isNaN(mult) || mult <= 0) {
      alert('El multiplicador debe ser mayor a 0');
      return;
    }

    try {
      const { error } = await supabase.from('producto_recetas').insert({
        parent_codigo: selectedParent.codigo,
        componente_codigo: newComponent,
        multiplicador: mult
      });

      if (error) throw error;
      
      setNewComponent('');
      setNewMultiplier('');
      setCompSearch('');
      await fetchData();
    } catch (err) {
      alert('Error agregando componente: ' + err.message);
    }
  };

  const handleRemoveComponent = async (recipeId) => {
    if (!confirm('¿Quitar este componente de la receta?')) return;
    try {
      const { error } = await supabase.from('producto_recetas').delete().eq('id', recipeId);
      if (error) throw error;
      await fetchData();
    } catch (err) {
      alert('Error quitando componente: ' + err.message);
    }
  };

  // Derived data
  const filteredParents = products.filter(p => 
    !parentSearch || p.nombre.toLowerCase().includes(parentSearch.toLowerCase()) || p.codigo.toLowerCase().includes(parentSearch.toLowerCase())
  ).slice(0, 50);

  const filteredComponents = products.filter(p => 
    !compSearch || p.nombre.toLowerCase().includes(compSearch.toLowerCase()) || p.codigo.toLowerCase().includes(compSearch.toLowerCase())
  ).slice(0, 50);

  const currentRecipeComponents = recipes.filter(r => r.parent_codigo === selectedParent?.codigo);

  return (
    <div className="tab-content active" style={{ display: 'flex', gap: '24px', height: '100%' }}>
      
      {/* Left Column: Select Parent Product */}
      <div className="card" style={{ width: '400px', display: 'flex', flexDirection: 'column' }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Settings size={18} />
          <span>Gestor de Recetas (Ensambles)</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div className="search-filter-group" style={{ marginBottom: '16px' }}>
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Buscar producto principal..." 
              value={parentSearch}
              onChange={e => setParentSearch(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {filteredParents.map(p => {
                const isSelected = selectedParent?.codigo === p.codigo;
                const hasRecipe = recipes.some(r => r.parent_codigo === p.codigo);
                return (
                  <li 
                    key={p.codigo}
                    onClick={() => setSelectedParent(p)}
                    style={{ 
                      padding: '12px 16px', 
                      borderBottom: '1px solid var(--border-color)', 
                      cursor: 'pointer',
                      background: isSelected ? 'var(--primary-light)' : 'transparent',
                      color: isSelected ? 'var(--primary)' : 'inherit',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{p.codigo}</div>
                      <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{p.nombre}</div>
                    </div>
                    {hasRecipe && <div className="badge badge-primary">Receta</div>}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* Right Column: Recipe Editor */}
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!selectedParent ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-secondary)' }}>
            <Settings size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <h3>Seleccione un Producto Principal</h3>
            <p>Elija un producto de la lista para ver o editar su receta de componentes.</p>
          </div>
        ) : (
          <>
            <div className="card-header" style={{ background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Editando Receta para:</div>
              <h3 style={{ margin: 0, color: 'var(--primary)' }}>{selectedParent.nombre}</h3>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>ID: {selectedParent.codigo}</div>
            </div>

            <div className="card-body" style={{ flex: 1, overflowY: 'auto' }}>
              <div className="alert info" style={{ marginBottom: '24px' }}>
                <AlertCircle size={16} />
                <span>Cuando se importe "<strong>{selectedParent.nombre}</strong>" desde campo, se reportará el consumo de los siguientes componentes multiplicados por la cantidad reportada.</span>
              </div>

              <h4>Componentes Actuales ({currentRecipeComponents.length})</h4>
              
              {currentRecipeComponents.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', background: 'var(--bg-card-hover)', borderRadius: '6px', marginBottom: '24px' }}>
                  No hay componentes. Este item se tratará como un producto simple.
                </div>
              ) : (
                <div className="table-container" style={{ marginBottom: '24px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Componente</th>
                        <th style={{ textAlign: 'right' }}>Multiplicador</th>
                        <th style={{ width: '50px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentRecipeComponents.map(comp => {
                        const compProduct = products.find(p => p.codigo === comp.componente_codigo);
                        return (
                          <tr key={comp.id}>
                            <td><strong>{comp.componente_codigo}</strong></td>
                            <td>{compProduct?.nombre || 'Desconocido'}</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)' }}>{comp.multiplicador}</td>
                            <td>
                              <button 
                                className="btn btn-secondary btn-sm" 
                                style={{ padding: '4px 8px', color: 'var(--danger)' }}
                                onClick={() => handleRemoveComponent(comp.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <h4>Agregar Componente</h4>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', background: 'var(--bg-card-hover)', padding: '16px', borderRadius: '6px' }}>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: '0.85rem', marginBottom: '4px', display: 'block' }}>Buscar Producto Componente</label>
                  <select 
                    className="form-control" 
                    value={newComponent} 
                    onChange={e => setNewComponent(e.target.value)}
                  >
                    <option value="">-- Seleccionar --</option>
                    {filteredComponents.map(p => (
                      <option key={p.codigo} value={p.codigo}>{p.codigo} - {p.nombre}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.85rem', marginBottom: '4px', display: 'block' }}>Multiplicador</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="Ej: 1 o 0.0167" 
                    step="0.0001"
                    min="0"
                    value={newMultiplier}
                    onChange={e => setNewMultiplier(e.target.value)}
                  />
                </div>
                <button 
                  className="btn btn-primary"
                  disabled={!newComponent || !newMultiplier}
                  onClick={handleAddComponent}
                >
                  <Plus size={16} /> Agregar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
