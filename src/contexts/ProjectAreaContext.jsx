import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { application } from '../app/composition/createApplication.js';

const ProjectAreaContext = createContext(null);

export function ProjectAreaProvider({ user, children }) {
  const [membership, setMembership] = useState(null);
  const [availableAreas, setAvailableAreas] = useState([]);
  const [activeArea, setActiveAreaState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadAccess = async () => {
      setLoading(true);
      setError('');

      try {
        const access = await application.projectAreas.loadAccess(user.id);

        if (!cancelled) {
          setMembership(access.membership);
          setAvailableAreas(access.availableAreas);
          setActiveAreaState(access.activeArea);
        }
      } catch (loadError) {
        console.error('Error loading project-area access:', loadError);
        if (!cancelled) setError(loadError.message || 'No se pudo cargar el acceso por área.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (user?.id) loadAccess();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const setActiveArea = useCallback((areaId) => {
    if (!membership) return false;
    const nextArea = application.projectAreas.selectArea({
      areaId,
      availableAreas,
      userId: user.id,
      projectId: membership.project_id,
    });
    if (!nextArea) return false;

    setActiveAreaState(nextArea);
    return true;
  }, [availableAreas, membership, user.id]);

  const value = useMemo(() => ({
    membership,
    role: membership?.role || null,
    isAdmin: membership?.role === 'admin',
    availableAreas,
    activeArea,
    activeAreaId: activeArea?.id || null,
    setActiveArea,
    loading,
    error
  }), [membership, availableAreas, activeArea, setActiveArea, loading, error]);

  if (loading) {
    return (
      <div className="loading-container" style={{ width: '100vw', height: '100vh', background: 'var(--bg-app)' }}>
        <span className="spinner"></span>
        <span>Cargando acceso al proyecto...</span>
      </div>
    );
  }

  if (error || !activeArea) {
    return (
      <div className="loading-container" style={{ width: '100vw', height: '100vh', background: 'var(--bg-app)', padding: '24px', textAlign: 'center' }}>
        <span>{error || 'No existe un área disponible para este usuario.'}</span>
      </div>
    );
  }

  return (
    <ProjectAreaContext.Provider value={value}>
      {children}
    </ProjectAreaContext.Provider>
  );
}

export function useProjectArea() {
  const context = useContext(ProjectAreaContext);
  if (!context) {
    throw new Error('useProjectArea must be used inside ProjectAreaProvider.');
  }
  return context;
}
