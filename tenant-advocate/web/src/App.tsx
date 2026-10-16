import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { useEffect, useState } from 'react';
import { api } from './api';
import { AuthProvider, useAuth } from './auth';

type Services = Record<string, boolean>;

const SERVICE_LABELS: Record<string, string> = {
  googleSignIn: 'Google sign-in',
  model: 'Claude model',
  arize: 'Arize tracing',
  daytona: 'Daytona sandbox',
  agentMemory: 'SurrealDB Agent Memory',
  nycOpenData: 'NYC Open Data',
};

function SignIn() {
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="card narrow">
      <h1>Tenant Advocate</h1>
      <p className="muted">
        Read your lease, check your building&rsquo;s public record, and keep a dated log of problems, with a source
        for every answer.
      </p>
      <div className="signin">
        <GoogleLogin
          onSuccess={(r) => {
            setError(null);
            if (!r.credential) return setError('Google did not return a credential. Try again.');
            signIn(r.credential).catch((e: Error) => setError(e.message));
          }}
          onError={() => setError('Google sign-in failed. Try again.')}
        />
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="fineprint">Information only, not legal advice.</p>
    </main>
  );
}

function Home() {
  const { user, signOut } = useAuth();
  const [services, setServices] = useState<Services | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ services: Services }>('/api/status')
      .then((r) => setServices(r.services))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <header className="bar">
        <strong>Tenant Advocate</strong>
        <span className="who">
          {user?.picture && <img src={user.picture} alt="" width={28} height={28} referrerPolicy="no-referrer" />}
          <span>{user?.name ?? user?.email}</span>
          <button className="link" onClick={() => void signOut()}>
            Sign out
          </button>
        </span>
      </header>
      <main className="card">
        <h2>Setup status</h2>
        <p className="muted">Which integrations have credentials configured on the server.</p>
        {error && <p role="alert" className="error">{error}</p>}
        {services && (
          <ul className="status">
            {Object.entries(services).map(([key, ok]) => (
              <li key={key} className={ok ? 'ok' : 'missing'}>
                <span aria-hidden>{ok ? '●' : '○'}</span> {SERVICE_LABELS[key] ?? key}
                <span className="state">{ok ? 'configured' : 'not set'}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <p className="center muted">Loading…</p>;
  return user ? <Home /> : <SignIn />;
}

export default function App() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ googleClientId?: string }>('/auth/config')
      .then((r) => (r.googleClientId ? setClientId(r.googleClientId) : setError('Server has no GOOGLE_CLIENT_ID configured.')))
      .catch(() => setError('Cannot reach the server. Is it running?'));
  }, []);

  if (error) return <p role="alert" className="center error">{error}</p>;
  if (!clientId) return <p className="center muted">Loading…</p>;

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
