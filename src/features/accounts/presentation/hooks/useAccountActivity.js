import { useEffect, useState } from 'react';
import { application } from '../../../../app/composition/createApplication.js';

export function useAccountActivity(limit = 25) {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const rows = await application.accounts.getMyRecentActivity(limit);
        if (!cancelled) setActivity(rows);
      } catch (loadError) {
        console.error('Error loading personal activity:', loadError);
        if (!cancelled) setError(loadError.message || 'No se pudo cargar la actividad reciente.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [limit]);

  return { activity, loading, error };
}
