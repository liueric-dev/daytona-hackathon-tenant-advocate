import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { useEffect, useState } from 'react';
import { api } from './api';
import { AuthProvider, useAuth } from './auth';
import { Advocate } from './components/Advocate';
import { BuildingCard } from './components/BuildingCard';
import { IssueLog } from './components/IssueLog';
import { Lease } from './components/Lease';

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
  const [address, setAddress] = useState(() => {
    try {
      return localStorage.getItem('ta.address') ?? '';
    } catch {
      return '';
    }
  });

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
      <div className="page">
        <BuildingCard onAddress={setAddress} />
        <div className="grid">
          <div className="col side">
            <Lease />
            <IssueLog />
          </div>
          <div className="col main">
            <Advocate address={address} />
          </div>
        </div>
        <footer className="foot">Information only, not legal advice. Read-only: this app never contacts your landlord.</footer>
      </div>
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
