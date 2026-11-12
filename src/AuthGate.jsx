import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import "./AuthGate.css";

const AUTHORIZED_EMAIL = "rodrigoquisbert543@gmail.com";
const REPORT_EMAIL = "rodrigoquisbert543+reportes@gmail.com";

function PasswordForm({
  title,
  description,
  submitLabel,
  message,
  onSubmit,
  onCancel,
  cancelLabel = "Cancelar",
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (await onSubmit(password)) setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <div className="auth-icon">
        <LockKeyhole size={24} aria-hidden="true" />
      </div>
      <h1>{title}</h1>
      <p>{description}</p>
      <label htmlFor="auth-new-password">Nueva contraseña</label>
      <input
        id="auth-new-password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {message && (
        <p className="auth-message" role="status">
          {message}
        </p>
      )}
      <button className="auth-submit" type="submit" disabled={submitting}>
        {submitting ? "Guardando..." : submitLabel}
      </button>
      {onCancel && (
        <button className="auth-cancel" type="button" onClick={onCancel}>
          {cancelLabel}
        </button>
      )}
    </form>
  );
}

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setPasswordFormOpen(true);
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

  const sessionEmail = session?.user?.email?.toLowerCase();
  const authorized = sessionEmail === AUTHORIZED_EMAIL;
  const reportAccount = sessionEmail === REPORT_EMAIL;
  const unauthorized = Boolean(
    sessionEmail && !authorized && !reportAccount,
  );

  useEffect(() => {
    if (!sessionEmail || authorized || reportAccount) return;

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
  }, [authorized, reportAccount, sessionEmail]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
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

  async function handlePasswordUpdate(newPassword) {
    setPasswordMessage("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      setPasswordMessage("Contraseña actualizada correctamente.");
      if (reportAccount) {
        setPasswordMessage(
          "Cuenta de informes configurada. Guarda esta contraseña en las propiedades de Apps Script y luego cierra esta sesión.",
        );
      }
      if (!reportAccount) setPasswordFormOpen(false);
      return true;
    } catch (updateError) {
      setPasswordMessage(
        `No se pudo actualizar la contraseña: ${updateError.message}`,
      );
      return false;
    }
  }

  async function handlePasswordReset() {
    setError("");
    setNotice("");
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        AUTHORIZED_EMAIL,
        { redirectTo: window.location.origin },
      );
      if (resetError) throw resetError;
      setNotice(
        "Si la cuenta existe, recibirás un enlace para crear o restablecer la contraseña.",
      );
    } catch (resetError) {
      setError(`No se pudo enviar el enlace: ${resetError.message}`);
    }
  }

  async function handleSignOut() {
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError(`No se pudo cerrar la sesión: ${signOutError.message}`);
        return;
      }
      setPasswordFormOpen(false);
    } catch (signOutError) {
      setError(`No se pudo cerrar la sesión: ${signOutError.message}`);
    }
  }

  if (!isSupabaseConfigured) return children;

  if (loading) {
    return (
      <main className="auth-page" aria-live="polite">
        <p>Comprobando acceso...</p>
      </main>
    );
  }

  if (reportAccount) {
    return (
      <main className="auth-page">
        <PasswordForm
          title="Configura la cuenta del informe"
          description="Esta cuenta solo permite generar el informe de caja del día; no abre la aplicación ni accede a otras tablas."
          submitLabel="Guardar contraseña"
          message={passwordMessage}
          onSubmit={handlePasswordUpdate}
          onCancel={handleSignOut}
          cancelLabel="Cerrar sesión"
        />
      </main>
    );
  }

  if (authorized) {
    return (
      <div className="auth-protected">
        <div className="auth-session-bar">
          <span>Sesión: {AUTHORIZED_EMAIL}</span>
          <div className="auth-session-actions">
            <button
              type="button"
              onClick={() => {
                setPasswordMessage("");
                setPasswordFormOpen((open) => !open);
              }}
            >
              Cambiar contraseña
            </button>
            <button type="button" onClick={handleSignOut}>
              Cerrar sesión
            </button>
          </div>
        </div>
        {passwordFormOpen && (
          <div className="auth-password-overlay">
            <PasswordForm
              title="Define tu contraseña"
              description="Usa una contraseña que puedas ingresar también en tu otro dispositivo."
              submitLabel="Actualizar contraseña"
              message={passwordMessage}
              onSubmit={handlePasswordUpdate}
              onCancel={() => setPasswordFormOpen(false)}
            />
          </div>
        )}
        {children}
      </div>
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
        {notice && (
          <p className="auth-message" role="status">
            {notice}
          </p>
        )}
        <button
          className="auth-submit"
          type="submit"
          disabled={submitting || !password}
        >
          {submitting ? "Ingresando..." : "Iniciar sesión"}
        </button>
        <button
          className="auth-forgot"
          type="button"
          onClick={handlePasswordReset}
        >
          No tengo contraseña o la olvidé
        </button>
      </form>
    </main>
  );
}
