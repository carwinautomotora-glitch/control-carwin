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

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CarwinAccess />
  </StrictMode>
);
