import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';

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
        const { data: membershipData, error: membershipError } = await supabase
          .from('project_memberships')
          .select('project_id, role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (membershipError) throw membershipError;
        if (!membershipData) throw new Error('El usuario no tiene acceso al proyecto actual.');

        const { data: areasData, error: areasError } = await supabase
          .from('project_areas')
          .select('id, project_id, code, name')
          .eq('project_id', membershipData.project_id)
          .eq('active', true)
          .order('name');

        if (areasError) throw areasError;
        if (!areasData?.length) throw new Error('El usuario no tiene un área activa asignada.');

        const storageKey = `active-project-area:${user.id}:${membershipData.project_id}`;
        const savedAreaId = localStorage.getItem(storageKey);
        const savedArea = areasData.find((area) => area.id === savedAreaId);
        const secaArea = areasData.find((area) => area.code === 'SECA');
        const initialArea = savedArea || secaArea || areasData[0];

        if (!cancelled) {
          setMembership(membershipData);
          setAvailableAreas(areasData);
          setActiveAreaState(initialArea);
          localStorage.setItem(storageKey, initialArea.id);
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
    const nextArea = availableAreas.find((area) => area.id === areaId);
    if (!nextArea || !membership) return false;

    setActiveAreaState(nextArea);
    localStorage.setItem(
      `active-project-area:${user.id}:${membership.project_id}`,
      nextArea.id
    );
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
