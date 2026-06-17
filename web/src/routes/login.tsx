import { createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { login } from '~/lib/auth';

export default function Login() {
  const [username, setUsername] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');
  const navigate = useNavigate();

  const handleLogin = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login({ username: username(), password: password() });
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ "min-height": "100vh", display: "flex", "align-items": "center", "justify-content": "center", padding: "1rem" }}>
      <div class="card bg-glass border-glass" style={{ width: "100%", "max-width": "400px", padding: "2rem" }}>
        <div style={{ "text-align": "center", "margin-bottom": "2rem" }}>
          <h1 style={{ "font-size": "1.5rem", "font-weight": "bold", margin: "0" }}>GeoOps</h1>
          <p style={{ color: "var(--text-secondary)", margin: "0.5rem 0 0" }}>Sign in to your account</p>
        </div>

        {error() && (
          <div style={{ "background-color": "rgba(239, 68, 68, 0.1)", color: "#ef4444", padding: "0.75rem", "border-radius": "4px", "margin-bottom": "1rem", "font-size": "0.875rem" }}>
            {error()}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div class="form-group" style={{ "margin-bottom": "1rem" }}>
            <label style={{ display: "block", "margin-bottom": "0.5rem", "font-size": "0.875rem" }}>Username</label>
            <input
              type="text"
              class="form-input"
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
              required
              style={{ width: "100%", padding: "0.75rem", "border-radius": "4px", border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)" }}
            />
          </div>

          <div class="form-group" style={{ "margin-bottom": "1.5rem" }}>
            <label style={{ display: "block", "margin-bottom": "0.5rem", "font-size": "0.875rem" }}>Password</label>
            <input
              type="password"
              class="form-input"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              required
              style={{ width: "100%", padding: "0.75rem", "border-radius": "4px", border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)" }}
            />
          </div>

          <button
            type="submit"
            class="btn btn-primary"
            disabled={loading()}
            style={{ width: "100%", padding: "0.75rem", "border-radius": "4px", border: "none", background: "var(--primary)", color: "white", "font-weight": "bold", cursor: loading() ? "not-allowed" : "pointer", opacity: loading() ? 0.7 : 1 }}
          >
            {loading() ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
