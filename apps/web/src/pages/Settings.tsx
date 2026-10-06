import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Download, KeyRound, LogOut, School as SchoolIcon, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useToast } from '../components/Toast';
import { Alert, Button, Field } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { normalizePhone, phone as formatPhone } from '../lib/format';
import { useAppSession } from '../lib/queries';
import type { School, Session } from '../lib/types';

export function Settings() {
  const session = useAppSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const director = session.user.role === 'director';

  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    qc.clear();
    qc.setQueryData(['me'], null);
    navigate('/', { replace: true });
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar__title">Réglages</div>
      </header>
      <main className="page" style={{ maxWidth: 720 }}>
        {session.school.isDemo ? (
          <Alert tone="warn">
            École de démonstration : elle sera effacée dans 24 h. Inscrivez votre école pour garder vos données.
          </Alert>
        ) : null}

        {/* Raccourcis utiles sur téléphone, où la barre latérale n'existe pas. */}
        <div className="btn-row" style={{ margin: '12px 0' }}>
          <Link className="btn btn--secondary btn--sm" to="/app/classes">
            <BookOpen size={16} /> Classes et tarifs
          </Link>
          {director ? (
            <Link className="btn btn--secondary btn--sm" to="/app/equipe">
              <Users size={16} /> Équipe
            </Link>
          ) : null}
          <a className="btn btn--secondary btn--sm" href="/api/export/impayes.csv" download>
            <Download size={16} /> Impayés (CSV)
          </a>
        </div>

        {director ? <SchoolForm session={session} /> : null}
        {!session.school.isDemo ? <PasswordForm /> : null}

        <div style={{ marginTop: 24 }}>
          <Button variant="ghost" block onClick={logout}>
            <LogOut size={18} /> Se déconnecter ({session.user.name})
          </Button>
        </div>
      </main>
    </>
  );
}

function SchoolForm({ session }: { session: Session }) {
  const qc = useQueryClient();
  const toast = useToast();
  const s = session.school;
  const [form, setForm] = useState({
    name: s.name,
    city: s.city,
    phone: s.phone ? formatPhone(s.phone) : '',
    yearLabel: s.yearLabel,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.phone.trim() && !normalizePhone(form.phone)) return setErrors({ phone: 'Numéro béninois invalide.' });
    setSaving(true);
    try {
      const res = await api.patch<{ school: School }>('/school', {
        ...form,
        phone: form.phone.trim() ? normalizePhone(form.phone) : null,
      });
      qc.setQueryData(['me'], { ...session, school: res.school });
      setErrors({});
      toast('École enregistrée');
    } catch (err) {
      if (err instanceof ApiError) setErrors(Object.keys(err.fields).length ? err.fields : { _: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h2 className="section-title">
        <span>
          <SchoolIcon size={14} aria-hidden="true" /> L’école (imprimé sur les reçus)
        </span>
      </h2>
      <form className="card card--pad form" onSubmit={submit} noValidate>
        {errors._ ? <Alert>{errors._}</Alert> : null}
        <Field label="Nom de l’école" value={form.name} onChange={set('name')} error={errors.name} maxLength={80} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Ville" value={form.city} onChange={set('city')} error={errors.city} maxLength={80} />
          <Field
            label="Année scolaire"
            value={form.yearLabel}
            onChange={set('yearLabel')}
            error={errors.yearLabel}
            placeholder="2026-2027"
          />
        </div>
        <Field
          label="Téléphone de l’école"
          prefix="+229"
          inputMode="tel"
          value={form.phone}
          onChange={set('phone')}
          error={errors.phone}
        />
        <Button type="submit" variant="secondary" loading={saving}>
          Enregistrer
        </Button>
      </form>
    </>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/account/password', { currentPassword, newPassword });
      setCurrent('');
      setNew('');
      setErrors({});
      toast('Mot de passe changé. Vos autres appareils sont déconnectés.');
    } catch (err) {
      if (err instanceof ApiError) setErrors(Object.keys(err.fields).length ? err.fields : { _: err.message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <h2 className="section-title">
        <span>
          <KeyRound size={14} aria-hidden="true" /> Mon mot de passe
        </span>
      </h2>
      <form className="card card--pad form" onSubmit={submit} noValidate>
        {errors._ ? <Alert>{errors._}</Alert> : null}
        <Field
          label="Mot de passe actuel"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.currentPassword}
        />
        <Field
          label="Nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          error={errors.newPassword}
          hint="8 caractères minimum, lettres et chiffres."
        />
        <Button type="submit" variant="secondary" loading={saving} disabled={!currentPassword || !newPassword}>
          Changer le mot de passe
        </Button>
      </form>
    </>
  );
}
