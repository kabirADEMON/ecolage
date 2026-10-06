import { Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Alert, Button, Field, Logo } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { normalizePhone } from '../lib/format';
import { useHealth, useSession, useSignedIn } from '../lib/session';
import type { Session } from '../lib/types';

function useAfterSignIn() {
  const signedIn = useSignedIn();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (session: Session) => {
    signedIn(session);
    const back = params.get('retour');
    navigate(back?.startsWith('/app') ? back : '/app', { replace: true });
  };
}

export function DemoButton({ label = 'Essayer avec une école d’exemple' }: { label?: string }) {
  const health = useHealth();
  const after = useAfterSignIn();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!health.data?.demo) return null;
  return (
    <>
      {error ? <Alert>{error}</Alert> : null}
      <Button
        type="button"
        variant="secondary"
        block
        loading={loading}
        onClick={async () => {
          setLoading(true);
          try {
            after(await api.post<Session>('/auth/demo'));
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Erreur');
            setLoading(false);
          }
        }}
      >
        <Sparkles size={18} /> {label}
      </Button>
    </>
  );
}

function AuthLayout({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  const me = useSession();
  if (me.data) return <Navigate to="/app" replace />;
  return (
    <main className="auth">
      <div className="auth__card">
        <Link to="/" className="auth__brand">
          <Logo /> Écolage
        </Link>
        <h1>{title}</h1>
        <p className="auth__lead">{lead}</p>
        {children}
      </div>
    </main>
  );
}

const errorsOf = (err: unknown) =>
  err instanceof ApiError ? (Object.keys(err.fields).length ? err.fields : { _: err.message }) : { _: 'Erreur' };

export function Login() {
  const after = useAfterSignIn();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizePhone(phone);
    if (!normalized) return setErrors({ phone: 'Numéro béninois invalide (ex. 01 97 12 34 56).' });
    setLoading(true);
    try {
      after(await api.post<Session>('/auth/login', { phone: normalized, password }));
    } catch (err) {
      setErrors(errorsOf(err));
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Connexion" lead="Direction ou caisse : votre numéro et votre mot de passe.">
      <form className="form" onSubmit={submit} noValidate>
        {errors._ ? <Alert>{errors._}</Alert> : null}
        <Field
          label="Numéro de téléphone"
          prefix="+229"
          inputMode="tel"
          autoComplete="username"
          placeholder="01 97 12 34 56"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
          autoFocus
        />
        <Field
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <Button type="submit" block loading={loading} disabled={!phone || !password}>
          Se connecter
        </Button>
      </form>
      <div className="divider">ou</div>
      <DemoButton />
      <p className="auth__foot">
        Nouvelle école ? <Link to="/inscription">Créer l’espace de mon école</Link>
      </p>
    </AuthLayout>
  );
}

export function Register() {
  const after = useAfterSignIn();
  const [form, setForm] = useState({ schoolName: '', city: '', directorName: '', phone: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const phone = normalizePhone(form.phone);
    if (!phone) return setErrors({ phone: 'Numéro béninois invalide (ex. 01 97 12 34 56).' });
    setLoading(true);
    try {
      after(await api.post<Session>('/auth/register', { ...form, phone }));
    } catch (err) {
      setErrors(errorsOf(err));
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="L’espace de votre école"
      lead="Vous créez le compte de la direction. Vous ajouterez les caissiers ensuite."
    >
      <form className="form" onSubmit={submit} noValidate>
        {errors._ ? <Alert>{errors._}</Alert> : null}
        <Field
          label="Nom de l’école"
          placeholder="Ex. Complexe scolaire Les Palmiers"
          value={form.schoolName}
          onChange={set('schoolName')}
          error={errors.schoolName}
          maxLength={80}
          autoFocus
        />
        <Field
          label="Ville"
          placeholder="Ex. Cotonou"
          value={form.city}
          onChange={set('city')}
          error={errors.city}
          maxLength={80}
        />
        <Field
          label="Votre nom"
          placeholder="Ex. Mme Adjovi"
          value={form.directorName}
          onChange={set('directorName')}
          error={errors.directorName}
          autoComplete="name"
          maxLength={80}
        />
        <Field
          label="Votre téléphone"
          prefix="+229"
          inputMode="tel"
          autoComplete="username"
          placeholder="01 97 12 34 56"
          value={form.phone}
          onChange={set('phone')}
          error={errors.phone}
        />
        <Field
          label="Mot de passe"
          type="password"
          autoComplete="new-password"
          hint="8 caractères minimum, lettres et chiffres."
          value={form.password}
          onChange={set('password')}
          error={errors.password}
        />
        <Button type="submit" block loading={loading}>
          Créer l’espace de l’école
        </Button>
      </form>
      <p className="auth__foot">
        Déjà inscrit ? <Link to="/connexion">Se connecter</Link>
      </p>
    </AuthLayout>
  );
}
