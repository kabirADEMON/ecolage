import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { Alert, Button, Field, Skeleton } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { normalizePhone } from '../lib/format';
import { useAppSession } from '../lib/queries';
import type { User } from '../lib/types';

export function Team() {
  const { user, school } = useAppSession();
  const qc = useQueryClient();
  const toast = useToast();
  const team = useQuery({
    queryKey: ['team'],
    queryFn: async () => (await api.get<{ team: User[] }>('/team')).team,
    enabled: user.role === 'director',
  });
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<{ name: string; password: string } | null>(null);

  if (user.role !== 'director') return <Navigate to="/app" replace />;

  const act = async (path: string, body?: object) => {
    try {
      const res = await api.post<{ user: User; temporaryPassword?: string }>(path, body);
      void qc.invalidateQueries({ queryKey: ['team'] });
      if (res.temporaryPassword) setSecret({ name: res.user.name, password: res.temporaryPassword });
      else toast(res.user.active ? `${res.user.name} réactivé` : `${res.user.name} désactivé`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action impossible');
    }
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar__title">Équipe</div>
        <Button size="sm" onClick={() => setAdding(true)} disabled={school.isDemo}>
          <UserPlus size={16} /> Ajouter un caissier
        </Button>
      </header>
      <main className="page">
        <p className="muted" style={{ marginBottom: 14 }}>
          Les caissiers encaissent et inscrivent les élèves. Seule la direction modifie les tarifs, accorde des
          réductions, annule un reçu et gère l’équipe.
        </p>
        {school.isDemo ? <Alert tone="warn">L’équipe ne se modifie pas dans l’école de démonstration.</Alert> : null}
        {!team.data ? (
          <Skeleton height={160} />
        ) : (
          <div className="card table-wrap" style={{ marginTop: 12 }}>
            <table className="table" aria-label="Équipe">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Téléphone</th>
                  <th>Rôle</th>
                  <th>État</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {team.data.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.name}</strong>
                    </td>
                    <td className="num">{m.phoneDisplay ? `+229 ${m.phoneDisplay}` : '—'}</td>
                    <td>{m.role === 'director' ? 'Direction' : 'Caisse'}</td>
                    <td>
                      <span className={`badge ${m.active ? 'badge--paid' : 'badge--neutral'}`}>
                        {m.active ? 'Actif' : 'Désactivé'}
                      </span>
                    </td>
                    <td className="right">
                      {m.role === 'cashier' && !school.isDemo ? (
                        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                          <Button variant="ghost" size="sm" onClick={() => act(`/team/${m.id}/reset-password`)}>
                            <KeyRound size={14} /> Nouveau mot de passe
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => act(`/team/${m.id}/active`, { active: !m.active })}
                          >
                            {m.active ? 'Désactiver' : 'Réactiver'}
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      {adding ? (
        <AddCashier
          onClose={() => setAdding(false)}
          onCreated={(name, password) => {
            setAdding(false);
            setSecret({ name, password });
            void qc.invalidateQueries({ queryKey: ['team'] });
          }}
        />
      ) : null}
      {secret ? (
        <Sheet title={`Mot de passe de ${secret.name}`} onClose={() => setSecret(null)}>
          <div className="form">
            <p>Communiquez-lui ce mot de passe provisoire de vive voix. Il ne sera plus affiché ensuite.</p>
            <p className="secret" data-testid="temp-password">
              {secret.password}
            </p>
            <p className="muted" style={{ fontSize: '0.9rem' }}>
              Il pourra le changer dans Réglages après sa première connexion.
            </p>
            <Button block onClick={() => setSecret(null)}>
              C’est noté
            </Button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

function AddCashier({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string, password: string) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizePhone(phone);
    if (!normalized) return setErrors({ phone: 'Numéro béninois invalide.' });
    setLoading(true);
    try {
      const res = await api.post<{ user: User; temporaryPassword: string }>('/team', { name, phone: normalized });
      onCreated(res.user.name, res.temporaryPassword);
    } catch (err) {
      if (err instanceof ApiError) setErrors(Object.keys(err.fields).length ? err.fields : { _: err.message });
      setLoading(false);
    }
  };
  return (
    <Sheet title="Ajouter un caissier" onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        {errors._ ? <Alert>{errors._}</Alert> : null}
        <Field label="Nom" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={80} />
        <Field
          label="Téléphone (identifiant de connexion)"
          prefix="+229"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
        />
        <Button type="submit" block loading={loading}>
          Créer le compte
        </Button>
      </form>
    </Sheet>
  );
}
