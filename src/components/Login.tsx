import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError('Correo o contraseña incorrectos, o acceso no disponible.');
      }
    } catch {
      setError('Error de conexión. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '16px',
    marginTop: '8px',
    marginBottom: '20px',
    borderRadius: '10px',
    border: '1px solid #6596c5',
    background: '#14283e',
    color: '#ffffff',
    fontSize: '18px',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#091522',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      color: '#ffffff',
      boxSizing: 'border-box',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '430px',
        background: '#0d2035',
        padding: '28px',
        borderRadius: '24px',
        border: '1px solid #C9A54D',
        boxShadow: '0 12px 40px #00000055',
        boxSizing: 'border-box',
      }}>
        <img
          src="/assets/images/Logo_Oficial.jpeg"
          alt="CARWIN Automotora"
          style={{
            width: '100%',
            maxHeight: '180px',
            objectFit: 'contain',
            borderRadius: '12px',
          }}
        />

        <h1 style={{
          textAlign: 'center',
          fontSize: '25px',
          marginTop: '22px',
        }}>
          CONTROL OPERATIVO
        </h1>

        <p style={{
          textAlign: 'center',
          color: '#E8BB55',
          fontSize: '18px',
          fontWeight: 'bold',
          marginBottom: '30px',
        }}>
          ACCESO PRIVADO
        </p>

        <form onSubmit={handleLogin}>
          <label htmlFor="login-email">
            Correo electrónico
          </label>

          <input
            id="login-email"
            type="email"
            autoComplete="username"
            placeholder="usuario@carwin.cl"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={inputStyle}
          />

          <label htmlFor="login-password">
            Contraseña
          </label>

          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Ingresa tu contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={inputStyle}
          />

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '22px',
          }}>
            <input
              type="checkbox"
              checked={showPassword}
              onChange={e => setShowPassword(e.target.checked)}
            />
            Mostrar contraseña
          </label>

          {error && (
            <p role="alert" style={{
              color: '#ff9090',
              marginBottom: '18px',
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '17px',
              borderRadius: '12px',
              border: 'none',
              background: '#DAB052',
              color: '#091522',
              fontSize: '18px',
              fontWeight: 'bold',
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'VERIFICANDO...' : 'INGRESAR A CARWIN'}
          </button>
        </form>

        <p style={{
          textAlign: 'center',
          color: '#b8cce0',
          fontSize: '14px',
          marginTop: '28px',
        }}>
          Acceso exclusivo para personal autorizado
        </p>

        <p style={{
          textAlign: 'center',
          color: '#E8BB55',
          fontSize: '13px',
        }}>
          CARWIN AUTOMOTORA · Vitacura
        </p>
      </div>
    </div>
  );
}
