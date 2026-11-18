import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import App from './App.tsx';
import Login from './components/Login';
import { supabase } from './lib/supabase';
import './index.css';

function CarwinAccess() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let active = true;

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, session) => {
        if (active) {
          setSession(session);
          setLoading(false);
        }
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function cerrarSesion() {
    if (!window.confirm('¿Deseas cerrar tu sesión de CARWIN?')) {
      return;
    }

    setClosing(true);

    try {
      const { error } = await supabase.auth.signOut({
        scope: 'local'
      });

      if (error) {
        window.alert('No se pudo cerrar la sesión. Intenta nuevamente.');
      }
    } catch {
      window.alert('Error de conexión.');
    } finally {
      setClosing(false);
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh',
        background: '#091522',
        color: '#E8BB55',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px'
      }}>
        <img
          src="/assets/images/Logo_Oficial.jpeg"
          alt="CARWIN"
          style={{ width: '280px', maxWidth: '85%' }}
        />
        <p>Verificando acceso...</p>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  const isAdmin =
    session.user.id === '9c806a5f-812c-4a07-bbd5-c0dd1c5909ad';

  return (
    <>
      <div style={{
        background: '#091522',
        borderBottom: '2px solid #DAB052',
        padding: '10px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '10px',
        color: '#ffffff'
      }}>
        <div>
          <div style={{
            color: '#E8BB55',
            fontWeight: 'bold',
            fontSize: '16px'
          }}>
            CARWIN CONTROL
          </div>

          <div style={{
            fontSize: '14px',
            color: '#ffffff'
          }}>
            {isAdmin ? 'Perfil Administrador' : 'Perfil'}
            {' · '}
            {session.user.email}
          </div>
        </div>

        <button
          onClick={cerrarSesion}
          disabled={closing}
          style={{
            background: '#14283e',
            color: '#E8BB55',
            border: '1px solid #DAB052',
            borderRadius: '8px',
            padding: '10px 16px',
            fontSize: '15px',
            fontWeight: 'bold',
            cursor: closing ? 'wait' : 'pointer'
          }}
        >
          {closing ? 'Cerrando...' : 'Cerrar sesión'}
        </button>
      </div>

      <App />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CarwinAccess />
  </StrictMode>
);
