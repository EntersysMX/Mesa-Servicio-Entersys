import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { glpiApi } from '../services/glpiApi';
import { KeyRound, Eye, EyeOff, Check, AlertCircle } from 'lucide-react';

export default function ChangePassword() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setMessage({ type: '', text: '' });
  };

  const toggleShowPassword = (field) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const validateForm = () => {
    if (!formData.newPassword || !formData.confirmPassword) {
      setMessage({ type: 'error', text: 'Por favor completa todos los campos' });
      return false;
    }

    if (formData.newPassword.length < 6) {
      setMessage({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres' });
      return false;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setMessage({ type: 'error', text: 'Las contraseñas no coinciden' });
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      // Actualizar contraseña en GLPI
      await glpiApi.updateItem('User', user.glpiID, {
        password: formData.newPassword,
        password2: formData.newPassword,
      });

      setMessage({ type: 'success', text: '¡Contraseña actualizada correctamente!' });
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error) {
      console.error('Error al cambiar contraseña:', error);
      setMessage({
        type: 'error',
        text: error.message || 'Error al cambiar la contraseña. Inténtalo de nuevo.'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="change-password-page">
      <div className="page-header">
        <h1>
          <KeyRound size={28} />
          Cambiar Contraseña
        </h1>
        <p>Actualiza tu contraseña de acceso al sistema</p>
      </div>

      <div className="change-password-container">
        <form onSubmit={handleSubmit} className="change-password-form">
          {message.text && (
            <div className={`message ${message.type}`}>
              {message.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
              {message.text}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="newPassword">Nueva Contraseña</label>
            <div className="password-input-wrapper">
              <input
                type={showPasswords.new ? 'text' : 'password'}
                id="newPassword"
                name="newPassword"
                value={formData.newPassword}
                onChange={handleChange}
                placeholder="Ingresa tu nueva contraseña"
                disabled={loading}
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => toggleShowPassword('new')}
              >
                {showPasswords.new ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirmar Contraseña</label>
            <div className="password-input-wrapper">
              <input
                type={showPasswords.confirm ? 'text' : 'password'}
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirma tu nueva contraseña"
                disabled={loading}
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => toggleShowPassword('confirm')}
              >
                {showPasswords.confirm ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div className="password-requirements">
            <p>La contraseña debe tener:</p>
            <ul>
              <li className={formData.newPassword.length >= 6 ? 'valid' : ''}>
                Al menos 6 caracteres
              </li>
              <li className={formData.newPassword === formData.confirmPassword && formData.confirmPassword ? 'valid' : ''}>
                Coincidir con la confirmación
              </li>
            </ul>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
          >
            {loading ? 'Actualizando...' : 'Cambiar Contraseña'}
          </button>
        </form>
      </div>

      <style>{`
        .change-password-page {
          max-width: 500px;
          margin: 0 auto;
          padding: 20px;
        }

        .page-header {
          text-align: center;
          margin-bottom: 30px;
        }

        .page-header h1 {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-size: 1.8rem;
          color: #1a1a2e;
          margin-bottom: 8px;
        }

        .page-header p {
          color: #666;
          font-size: 0.95rem;
        }

        .change-password-container {
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
          padding: 30px;
        }

        .change-password-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .message {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 0.9rem;
        }

        .message.success {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .message.error {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-weight: 500;
          color: #333;
          font-size: 0.9rem;
        }

        .password-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .password-input-wrapper input {
          width: 100%;
          padding: 12px 45px 12px 14px;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 1rem;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .password-input-wrapper input:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .password-input-wrapper input:disabled {
          background: #f5f5f5;
          cursor: not-allowed;
        }

        .toggle-password {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          cursor: pointer;
          color: #666;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .toggle-password:hover {
          color: #333;
        }

        .password-requirements {
          background: #f8f9fa;
          padding: 14px 18px;
          border-radius: 8px;
          font-size: 0.85rem;
        }

        .password-requirements p {
          margin: 0 0 8px 0;
          color: #666;
          font-weight: 500;
        }

        .password-requirements ul {
          margin: 0;
          padding-left: 20px;
        }

        .password-requirements li {
          color: #999;
          margin-bottom: 4px;
          transition: color 0.2s;
        }

        .password-requirements li.valid {
          color: #28a745;
        }

        .password-requirements li.valid::marker {
          content: '✓ ';
        }

        .btn-block {
          width: 100%;
          padding: 14px;
          font-size: 1rem;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 0.2s, transform 0.1s;
        }

        .btn-primary {
          background: #2563eb;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #1d4ed8;
        }

        .btn-primary:active:not(:disabled) {
          transform: scale(0.98);
        }

        .btn-primary:disabled {
          background: #93c5fd;
          cursor: not-allowed;
        }

        @media (max-width: 480px) {
          .change-password-container {
            padding: 20px;
          }

          .page-header h1 {
            font-size: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}
