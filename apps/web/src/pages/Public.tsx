import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CircleCheck, CircleX, Clock, Phone, Printer, Smartphone } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AmountInput } from '../components/AmountInput';
import { ReceiptView } from '../components/ReceiptView';
import { Sheet } from '../components/Sheet';
import { Alert, Button, Field, Logo, Skeleton } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { dueLabel, METHOD_LABEL, money, STATUS_LABEL, when } from '../lib/format';
import type { OnlineStatus, Portal, Receipt } from '../lib/types';

function Foot() {
  return (
    <p className="public__foot">
      Suivi de scolarité avec <Link to="/">Écolage</Link>.
    </p>
  );
}

function Dead() {
  return (
    <main className="public">
      <div className="status card" style={{ marginTop: 40 }}>
        <span className="status__icon" style={{ background: 'var(--surface-2)' }}>
          <CircleX size={34} />
        </span>
        <h1>Ce lien ne fonctionne plus</h1>
        <p className="muted">Demandez un nouveau lien au secrétariat de l’école.</p>
      </div>
      <Foot />
    </main>
  );
}

// Portail du parent : ouvert depuis WhatsApp, sans compte, en lecture seule.
export function ParentPortal() {
  const { token = '' } = useParams();
  const [paying, setPaying] = useState(false);
  const q = useQuery({
    queryKey: ['portal', token],
    queryFn: () => api.get<Portal>(`/public/students/${token}`),
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
  });
  if (q.isError) return <Dead />;
  const p = q.data;
  return (
    <main className="public">
      <header className="public__head">
        <Logo />
        <div>
          <div style={{ fontWeight: 700 }}>{p?.school.name ?? '…'}</div>
          <div className="muted" style={{ fontSize: '0.875rem' }}>
            Scolarité {p?.school.yearLabel}
          </div>
        </div>
      </header>
      {!p ? (
        <Skeleton height={240} />
      ) : (
        <>
          <section className="card balance-card">
            <p style={{ fontWeight: 600 }}>
              {p.student.firstName} {p.student.lastName} · {p.student.className}
            </p>
            <p className="balance-card__label" style={{ marginTop: 10 }}>
              {p.summary.balance > 0 ? 'Reste à payer' : 'Scolarité entièrement payée'}
            </p>
            <p
              className={`balance-card__amount num ${p.summary.balance <= 0 ? 'balance-card__amount--zero' : ''}`}
              data-testid="portal-balance"
            >
              {money(Math.max(p.summary.balance, 0))}
            </p>
            <div className="progress" style={{ margin: '10px 0' }}>
              <span
                style={{
                  width: `${p.summary.totalNet ? Math.min(100, (p.summary.totalPaid / p.summary.totalNet) * 100) : 100}%`,
                }}
              />
            </div>
            <p className="muted num" style={{ fontSize: '0.9rem' }}>
              {money(p.summary.totalPaid)} payés sur {money(p.summary.totalNet)}
            </p>
            <div className="balance-card__meta">
              {p.summary.overdueAmount > 0 ? (
                <span className="badge badge--overdue">{money(p.summary.overdueAmount)} déjà échus</span>
              ) : null}
              {p.summary.nextDue ? (
                <span className="badge badge--neutral">
                  {p.summary.nextDue.label} : {money(p.summary.nextDue.remaining)} d’ici{' '}
                  {dueLabel(p.summary.nextDue.dueDate)}
                </span>
              ) : null}
            </div>
            {p.summary.balance > 0 ? (
              <div style={{ marginTop: 18 }}>
                <Button block onClick={() => setPaying(true)}>
                  <Smartphone size={18} /> Payer par Mobile Money
                </Button>
              </div>
            ) : null}
            {p.school.phone ? (
              <a className="btn btn--ghost btn--block" style={{ marginTop: 6 }} href={`tel:+229${p.school.phone}`}>
                <Phone size={16} /> Appeler l’école
              </a>
            ) : null}
          </section>

          <h2 className="section-title">Échéancier</h2>
          <ul className="list card">
            {p.summary.schedule.map((l) => (
              <li className="entry" key={l.id}>
                <div className="entry__main">
                  <div className="entry__title">{l.label}</div>
                  <div className="entry__meta">Avant le {dueLabel(l.dueDate)}</div>
                </div>
                <div className="entry__end">
                  <div className="entry__amount num">{money(l.net)}</div>
                  <span className={`badge badge--${l.status}`}>
                    {l.status === 'paid'
                      ? 'Payée'
                      : l.remaining < l.net
                        ? `Reste ${money(l.remaining)}`
                        : STATUS_LABEL[l.status]}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <h2 className="section-title">Reçus</h2>
          {p.payments.length === 0 ? (
            <div className="card card--pad muted">Aucun paiement pour le moment.</div>
          ) : (
            <ul className="list card">
              {p.payments.map((r) => (
                <li key={r.id}>
                  <Link className="row" to={`/p/${token}/recus/${r.id}`}>
                    <div className="row__main">
                      <div className="row__title">Reçu n° {r.receiptNumber}</div>
                      <div className="row__sub">
                        {when(r.createdAt)} · {METHOD_LABEL[r.method]}
                      </div>
                    </div>
                    <span className="row__amount num">{money(r.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Foot />
      {p && paying ? <PaySheet token={token} portal={p} onClose={() => setPaying(false)} /> : null}
    </main>
  );
}

function PaySheet({ token, portal, onClose }: { token: string; portal: Portal; onClose: () => void }) {
  const s = portal.summary;
  const suggested = s.overdueAmount || s.nextDue?.remaining || s.balance;
  const [amount, setAmount] = useState<number | null>(suggested);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const min = portal.payment.minAmount;
    if (!amount || amount < min || amount > s.balance) return setError(`Entre ${money(min)} et ${money(s.balance)}.`);
    setLoading(true);
    try {
      const res = await api.post<{ url: string }>(`/public/students/${token}/payments`, { amount });
      window.location.assign(res.url);
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.amount ?? err.message) : 'Erreur');
      setLoading(false);
    }
  };
  return (
    <Sheet title="Payer par Mobile Money" onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <AmountInput label="Montant à payer" value={amount} onChange={setAmount} error={error} />
        <div className="chips" style={{ justifyContent: 'center' }}>
          {s.overdueAmount > 0 ? (
            <button
              type="button"
              className="chip"
              aria-pressed={amount === s.overdueAmount}
              onClick={() => setAmount(s.overdueAmount)}
            >
              Le retard
            </button>
          ) : null}
          <button
            type="button"
            className="chip"
            aria-pressed={amount === s.balance}
            onClick={() => setAmount(s.balance)}
          >
            Toute l’année ({money(s.balance)})
          </button>
        </div>
        <p className="muted" style={{ fontSize: '0.875rem' }}>
          Vous allez être redirigé vers la page de paiement sécurisée{' '}
          {portal.payment.provider === 'fedapay' ? 'FedaPay' : '(simulation)'}, où vous choisissez MTN MoMo ou Moov
          Money. Le reçu de l’école est émis dès que le paiement est confirmé.
        </p>
        <Button type="submit" block loading={loading}>
          Payer {amount ? money(amount) : ''}
        </Button>
      </form>
    </Sheet>
  );
}

export function PortalReceipt() {
  const { token = '', id = '' } = useParams();
  const q = useQuery({
    queryKey: ['portal-receipt', id],
    queryFn: () => api.get<Receipt>(`/public/students/${token}/receipts/${id}`),
  });
  if (q.isError) return <Dead />;
  return (
    <main className="public" style={{ maxWidth: 760 }}>
      <div className="btn-row no-print" style={{ padding: '16px 0' }}>
        <Link className="btn btn--ghost" to={`/p/${token}`}>
          <ArrowLeft size={18} /> Retour
        </Link>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={18} /> Imprimer / PDF
        </Button>
      </div>
      {q.data ? <ReceiptView r={q.data} /> : <Skeleton height={420} />}
    </main>
  );
}

export function PaymentReturn() {
  const { id = '' } = useParams();
  const [startedAt] = useState(() => Date.now());
  const q = useQuery({
    queryKey: ['online', id],
    queryFn: () => api.get<OnlineStatus>(`/public/payments/${id}`),
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' && Date.now() - startedAt < 120_000 ? 2_500 : false,
  });
  const p = q.data;
  if (q.isError) return <Dead />;
  if (!p) {
    return (
      <main className="auth">
        <span className="spinner" style={{ color: 'var(--brand)', width: 28, height: 28 }} />
      </main>
    );
  }
  const view = {
    approved: {
      icon: <CircleCheck size={38} />,
      bg: 'var(--ok-soft)',
      fg: 'var(--ok)',
      title: 'Paiement reçu, merci !',
      text: `${money(p.amount)} versés à ${p.schoolName} pour ${p.studentName}.`,
    },
    pending: {
      icon: <Clock size={38} />,
      bg: 'var(--warn-soft)',
      fg: 'var(--warn)',
      title: 'Paiement en cours…',
      text: 'Validez le paiement sur votre téléphone si on vous le demande. Cette page se met à jour toute seule.',
    },
    declined: {
      icon: <CircleX size={38} />,
      bg: 'var(--danger-soft)',
      fg: 'var(--danger)',
      title: 'Paiement refusé',
      text: 'Aucun montant n’a été prélevé. Vous pouvez réessayer.',
    },
    canceled: {
      icon: <CircleX size={38} />,
      bg: 'var(--surface-2)',
      fg: 'var(--muted)',
      title: 'Paiement annulé',
      text: 'Aucun montant n’a été prélevé.',
    },
  }[p.status];
  return (
    <main className="public">
      <div className="status card" style={{ marginTop: 40 }}>
        <span className="status__icon" style={{ background: view.bg, color: view.fg }}>
          {view.icon}
        </span>
        <h1 data-testid="payment-status">{view.title}</h1>
        <p className="muted">{view.text}</p>
        {p.status === 'approved' ? (
          <p className="num" style={{ fontWeight: 600 }}>
            {p.balance > 0 ? `Reste à payer : ${money(p.balance)}` : 'La scolarité est entièrement payée.'}
          </p>
        ) : null}
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          {p.receiptId ? (
            <Link className="btn btn--primary" to={`/p/${p.shareToken}/recus/${p.receiptId}`}>
              Voir le reçu
            </Link>
          ) : null}
          <Link className="btn btn--secondary" to={`/p/${p.shareToken}`}>
            Retour au suivi
          </Link>
        </div>
      </div>
      <Foot />
    </main>
  );
}

const OPERATORS = [
  { id: 'mtn', label: 'MTN MoMo', color: '#ffcc00' },
  { id: 'moov', label: 'Moov Money', color: '#0066b3' },
];

export function PaymentSimulation() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [operator, setOperator] = useState('mtn');
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState<'approved' | 'declined' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['online', id], queryFn: () => api.get<OnlineStatus>(`/public/payments/${id}`) });
  useEffect(() => {
    if (q.data && q.data.status !== 'pending') navigate(`/paiement/${id}`, { replace: true });
  }, [q.data, id, navigate]);

  const decide = async (outcome: 'approved' | 'declined') => {
    setLoading(outcome);
    try {
      await api.post(`/public/payments/${id}/simulate`, { outcome });
      navigate(`/paiement/${id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setLoading(null);
    }
  };
  const p = q.data;
  return (
    <main className="public">
      <header className="public__head">
        <Logo />
        <div style={{ fontWeight: 700 }}>Paiement Mobile Money</div>
      </header>
      <Alert tone="warn">Simulation de démonstration : aucun argent réel n’est prélevé.</Alert>
      {!p ? (
        <Skeleton height={300} style={{ marginTop: 14 }} />
      ) : (
        <div className="card card--pad form simulator" style={{ marginTop: 14 }}>
          {error ? <Alert>{error}</Alert> : null}
          <div style={{ textAlign: 'center' }}>
            <p className="muted">
              Scolarité de {p.studentName} → {p.schoolName}
            </p>
            <p className="balance-card__amount num">{money(p.amount)}</p>
          </div>
          <div className="operators" role="group" aria-label="Opérateur">
            {OPERATORS.map((o) => (
              <button
                key={o.id}
                type="button"
                className="operator"
                aria-pressed={operator === o.id}
                onClick={() => setOperator(o.id)}
              >
                <span className="operator__dot" style={{ background: o.color }} />
                {o.label}
              </button>
            ))}
          </div>
          <Field
            label="Numéro Mobile Money"
            prefix="+229"
            inputMode="tel"
            placeholder="01 97 12 34 56"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <Button block loading={loading === 'approved'} disabled={loading !== null} onClick={() => decide('approved')}>
            Valider le paiement de {money(p.amount)}
          </Button>
          <Button
            variant="ghost"
            block
            loading={loading === 'declined'}
            disabled={loading !== null}
            onClick={() => decide('declined')}
          >
            Simuler un refus
          </Button>
        </div>
      )}
    </main>
  );
}

export function NotFound() {
  return (
    <main className="auth">
      <div className="status">
        <h1>Page introuvable</h1>
        <p className="muted">Le lien est peut-être incomplet.</p>
        <Link className="btn btn--primary" to="/">
          Retour à l’accueil
        </Link>
      </div>
    </main>
  );
}
