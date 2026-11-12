import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import "./AuthGate.css";

const AUTHORIZED_EMAIL = "rodrigoquisbert543@gmail.com";

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });

    supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError)
          setError(`No se pudo comprobar la sesión: ${sessionError.message}`);
        setSession(data.session);
        setLoading(false);
      })
      .catch((sessionError) => {
        if (!active) return;
        setError(`No se pudo comprobar la sesión: ${sessionError.message}`);
        setLoading(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const email = session?.user?.email?.toLowerCase();
    if (!email || email === AUTHORIZED_EMAIL) return;

    supabase.auth
      .signOut()
      .then(({ error: signOutError }) => {
        if (signOutError)
          setError(
            `No se pudo cerrar la sesión no autorizada: ${signOutError.message}`,
          );
      })
      .catch((signOutError) => {
        setError(
          `No se pudo cerrar la sesión no autorizada: ${signOutError.message}`,
        );
      });
  }, [session]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: AUTHORIZED_EMAIL,
        password,
      });
      if (signInError) throw signInError;
      setPassword("");
    } catch (signInError) {
      setError(`No se pudo iniciar sesión: ${signInError.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError)
        setError(`No se pudo cerrar la sesión: ${signOutError.message}`);
    } catch (signOutError) {
      setError(`No se pudo cerrar la sesión: ${signOutError.message}`);
    }
  }

  if (!isSupabaseConfigured) return children;

  const sessionEmail = session?.user?.email?.toLowerCase();
  const authorized =
    sessionEmail === AUTHORIZED_EMAIL;
  const unauthorized = Boolean(sessionEmail && !authorized);

  if (loading) {
    return (
      <main className="auth-page" aria-live="polite">
        <p>Comprobando acceso...</p>
      </main>
    );
  }

  if (authorized) {
    return (
      <>
        <div className="auth-session-bar">
          <span>Sesión: {AUTHORIZED_EMAIL}</span>
          <button type="button" onClick={handleSignOut}>
            Cerrar sesión
          </button>
        </div>
        {children}
      </>
    );
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-icon">
          <LockKeyhole size={24} aria-hidden="true" />
        </div>
        <h1>Acceso protegido</h1>
        <p>Inicia sesión con la cuenta autorizada para sincronizar la aplicación.</p>
        <label htmlFor="auth-email">Correo autorizado</label>
        <input id="auth-email" type="email" value={AUTHORIZED_EMAIL} readOnly />
        <label htmlFor="auth-password">Contraseña</label>
        <input
          id="auth-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {(error || unauthorized) && (
          <p className="auth-error" role="alert">
            {error ||
              "Esta cuenta no está autorizada para acceder a la aplicación."}
          </p>
        )}
        <button
          className="auth-submit"
          type="submit"
          disabled={submitting || !password}
        >
          {submitting ? "Ingresando..." : "Iniciar sesión"}
        </button>
      </form>
    </main>
  );
}
