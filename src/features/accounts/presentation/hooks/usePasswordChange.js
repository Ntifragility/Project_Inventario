import { useState } from 'react';
import { application } from '../../../../app/composition/createApplication.js';

const EMPTY_MESSAGE = Object.freeze({ type: '', text: '' });

export function usePasswordChange(email) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(EMPTY_MESSAGE);

  const clearMessage = () => setMessage(EMPTY_MESSAGE);

  const changePassword = async ({ currentPassword, password, confirmPassword }) => {
    setSaving(true);
    clearMessage();
    try {
      await application.accounts.changePassword({
        email,
        currentPassword,
        password,
        confirmPassword,
      });
      setMessage({ type: 'success', text: 'Contraseña actualizada correctamente.' });
      return true;
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'No se pudo actualizar la contraseña.' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { saving, message, clearMessage, changePassword };
}
