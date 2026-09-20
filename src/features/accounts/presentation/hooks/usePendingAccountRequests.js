import { useCallback, useEffect, useState } from 'react';
import { application } from '../../../../app/composition/createApplication.js';

export function usePendingAccountRequests({ enabled, refreshInterval = 60000 }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      setRequests(await application.accounts.listAccountRequests('pending'));
    } catch (requestError) {
      console.error('Error loading account request notifications:', requestError);
      setError('No se pudieron cargar las solicitudes. Verifique la migración de la base de datos.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setRequests([]);
      return undefined;
    }

    refresh();
    const timer = window.setInterval(refresh, refreshInterval);
    return () => window.clearInterval(timer);
  }, [enabled, refresh, refreshInterval]);

  return { requests, loading, error, refresh };
}
