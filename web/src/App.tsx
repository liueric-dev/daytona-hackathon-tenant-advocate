import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { useEffect, useState } from 'react';
import { api } from './api';
import { AuthProvider, useAuth } from './auth';
import { Workspace } from './v2/Workspace';

function SignIn() {
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="signin-page">
      <div className="signin-sheet">
        <h1>Tenant Advocate</h1>
        <span className="signin-tag">for New York City renters</span>
        <p className="signin-lede">
          No heat, a leak, a fee you didn&rsquo;t expect, a clause that looks wrong. Get a clear answer with a source for
          every claim.
        </p>
        <ul className="signin-list">
          <li>Checks your building&rsquo;s HPD violations and complaints</li>
          <li>Reads your lease and quotes it, page by page</li>
          <li>Keeps a dated log of problems and drafts letters for your approval</li>
        </ul>
        <GoogleLogin
          onSuccess={(r) => {
            setError(null);
            if (!r.credential) return setError('Google did not return a credential. Try again.');
            signIn(r.credential).catch((e: Error) => setError(e.message));
          }}
          onError={() => setError('Google sign-in failed. Try again.')}
        />
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <p className="signin-fine">Information only, not legal advice · This app never contacts your landlord.</p>
      </div>
    </main>
  );
}

function Home() {
  return <Workspace />;
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
