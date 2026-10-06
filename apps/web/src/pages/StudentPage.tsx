import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CircleCheck,
  Link2,
  MessageCircle,
  Pencil,
  Printer,
  Receipt as ReceiptIcon,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { AmountInput } from '../components/AmountInput';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { Alert, Button, Field, Skeleton } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { dueLabel, METHOD_LABEL, money, phone as formatPhone, STATE_LABEL, STATUS_LABEL, when } from '../lib/format';
import { useAppSession, useClasses, useIsDirector, useStudent, useStudentMutation } from '../lib/queries';
import type { PaymentMethod, StudentDetail } from '../lib/types';
import { portalUrl, receiptMessage, reminderMessage, whatsappLink } from '../lib/whatsapp';
import { StudentForm } from './Students';

type Panel =
  'collect' | 'edit' | 'share' | { done: { paymentId: string; receiptNumber: number; amount: number } } | null;

export function StudentPage() {
  const { id = '' } = useParams();
  const { school } = useAppSession();
  const director = useIsDirector();
  const navigate = useNavigate();
  const toast = useToast();
  const query = useStudent(id);
  const classes = useClasses();
  const [params, setParams] = useSearchParams();
  const [panel, setPanel] = useState<Panel>(null);
  const archive = useStudentMutation((archived: boolean) =>
    api.post<StudentDetail>(`/students/${id}/archive`, { archived }),
  );

  useEffect(() => {
    if (query.data && params.get('encaisser')) {
      setPanel('collect');
      setParams({}, { replace: true });
    }
  }, [params, query.data, setParams]);

  if (query.isError) {
    return (
      <main className="page" style={{ paddingTop: 24 }}>
        <Alert>
          {query.error instanceof ApiError && query.error.status === 404
            ? 'Cet élève n’existe pas.'
            : query.error.message}
        </Alert>
      </main>
    );
  }
  const d = query.data;
  if (!d) {
    return (
      <main className="page" style={{ paddingTop: 24 }}>
        <Skeleton height={140} />
        <Skeleton height={260} style={{ marginTop: 12 }} />
      </main>
    );
  }
  const { student: s, summary } = d;

  return (
    <>
      <header className="topbar">
        <Link to="/app/eleves" className="btn btn--ghost btn--icon" aria-label="Retour aux élèves">
          <ArrowLeft size={22} />
        </Link>
        <div className="topbar__title">Fiche élève</div>
      </header>
      <main className="page">
        <div className="student-head">
          <div>
            <h1>
              {s.lastName} {s.firstName}
            </h1>
            <div className="student-head__meta">
              <span>{s.className}</span>
              <span className="num">Matricule {s.matricule}</span>
              <span>
                {s.parentName}
                {s.parentPhone ? ` · +229 ${formatPhone(s.parentPhone)}` : ''}
              </span>
              {s.archived ? <span className="badge badge--neutral">Archivé</span> : null}
            </div>
          </div>
          <div className="btn-row">
            <Button onClick={() => setPanel('collect')} disabled={s.archived || summary.balance <= 0}>
              <ReceiptIcon size={18} /> Encaisser
            </Button>
            <a
              className="btn btn--whatsapp"
              href={whatsappLink(s.parentPhone, reminderMessage(school, d))}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={18} /> Rappel au parent
            </a>
            <Button variant="secondary" onClick={() => setPanel('share')}>
              <Link2 size={18} /> Portail parent
            </Button>
            <Button variant="secondary" onClick={() => setPanel('edit')} aria-label="Modifier la fiche">
              <Pencil size={18} />
            </Button>
          </div>
        </div>

        <section className="kpis" aria-label="Situation">
          <div className={`card kpi ${summary.state === 'settled' ? '' : 'kpi--brand'}`}>
            <p className="kpi__label">Reste à payer</p>
            <p className="kpi__value num" data-testid="balance">
              {money(Math.max(summary.balance, 0))}
            </p>
            <p className="kpi__sub">
              {summary.balance < 0 ? `Avance de ${money(-summary.balance)}` : STATE_LABEL[summary.state]}
            </p>
          </div>
          <div className="card kpi">
            <p className="kpi__label">Déjà payé</p>
            <p className="kpi__value num" data-testid="paid">
              {money(summary.totalPaid)}
            </p>
            <div className="progress" style={{ marginTop: 10 }}>
              <span
                style={{
                  width: `${summary.totalNet ? Math.min(100, (summary.totalPaid / summary.totalNet) * 100) : 100}%`,
                }}
              />
            </div>
          </div>
          <div className="card kpi">
            <p className="kpi__label">Scolarité de l’année</p>
            <p className="kpi__value num">{money(summary.totalNet)}</p>
            <p className="kpi__sub">
              {summary.discount > 0 ? `Réduction de ${money(summary.discount)} incluse` : `${s.className}`}
            </p>
          </div>
          <div className="card kpi">
            <p className="kpi__label">En retard</p>
            <p
              className="kpi__value num"
              style={{ color: summary.overdueAmount ? 'var(--danger)' : undefined }}
              data-testid="overdue"
            >
              {money(summary.overdueAmount)}
            </p>
            <p className="kpi__sub">
              {summary.nextDue
                ? `Prochaine : ${money(summary.nextDue.remaining)} d’ici ${dueLabel(summary.nextDue.dueDate)}`
                : '—'}
            </p>
          </div>
        </section>

        <div className="two-cols" style={{ marginTop: 8 }}>
          <section>
            <h2 className="section-title">Échéancier</h2>
            <div className="card table-wrap">
              <table className="table" aria-label="Échéancier">
                <thead>
                  <tr>
                    <th>Échéance</th>
                    <th>Date limite</th>
                    <th className="right">Montant</th>
                    <th className="right">Reste</th>
                    <th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.schedule.map((line) => (
                    <tr key={line.id}>
                      <td>
                        <strong>{line.label}</strong>
                      </td>
                      <td>{dueLabel(line.dueDate)}</td>
                      <td className="right num">
                        {money(line.net)}
                        {line.net !== line.amount ? (
                          <div className="muted" style={{ fontSize: '0.75rem', textDecoration: 'line-through' }}>
                            {money(line.amount)}
                          </div>
                        ) : null}
                      </td>
                      <td className="right num">{line.remaining ? money(line.remaining) : '—'}</td>
                      <td>
                        <span className={`badge badge--${line.status}`}>{STATUS_LABEL[line.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="section-title">Reçus</h2>
            {d.payments.length === 0 ? (
              <div className="card card--pad muted">Aucun paiement pour le moment.</div>
            ) : (
              <ul className="list card" aria-label="Reçus">
                {d.payments.map((p) => (
                  <li key={p.id}>
                    <Link className="row" to={`/app/recus/${p.id}`} data-testid="payment">
                      <div className="row__main">
                        <div className="row__title">
                          Reçu n° {p.receiptNumber} · {METHOD_LABEL[p.method]}
                        </div>
                        <div className="row__sub">
                          {when(p.createdAt)} · {p.online ? 'Payé en ligne' : (p.cashierName ?? '')}
                        </div>
                      </div>
                      <div className="row__end">
                        <div
                          className="row__amount num"
                          style={p.cancelled ? { textDecoration: 'line-through', color: 'var(--faint)' } : undefined}
                        >
                          {money(p.amount)}
                        </div>
                        {p.cancelled ? <span className="badge badge--overdue">Annulé</span> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {director ? (
              <div style={{ marginTop: 16 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await archive.mutateAsync(!s.archived);
                      toast(s.archived ? 'Élève réinscrit' : 'Élève archivé');
                    } catch (err) {
                      toast(err instanceof Error ? err.message : 'Action impossible');
                    }
                  }}
                >
                  {s.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                  {s.archived ? 'Réactiver l’élève' : 'Archiver (départ de l’école)'}
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      </main>

      {panel === 'collect' ? (
        <CollectSheet detail={d} onClose={() => setPanel(null)} onDone={(done) => setPanel({ done })} />
      ) : null}
      {panel === 'edit' && classes.data ? (
        <StudentForm classes={classes.data} detail={d} onClose={() => setPanel(null)} />
      ) : null}
      {panel === 'share' ? <ShareSheet detail={d} onClose={() => setPanel(null)} /> : null}
      {panel && typeof panel === 'object' ? (
        <Sheet title="Paiement enregistré" onClose={() => setPanel(null)}>
          <div className="form" style={{ textAlign: 'center' }}>
            <span
              className="status__icon"
              style={{ background: 'var(--ok-soft)', color: 'var(--ok)', justifySelf: 'center', margin: '0 auto' }}
            >
              <CircleCheck size={36} />
            </span>
            <p data-testid="receipt-done">
              Reçu n° <strong className="num">{panel.done.receiptNumber}</strong> · {money(panel.done.amount)}
            </p>
            <p className="muted">Reste à payer : {money(Math.max(summary.balance, 0))}</p>
            <Button block onClick={() => navigate(`/app/recus/${panel.done.paymentId}?imprimer=1`)}>
              <Printer size={18} /> Imprimer le reçu
            </Button>
            <a
              className="btn btn--whatsapp btn--block"
              href={whatsappLink(s.parentPhone, receiptMessage(school, d, panel.done.receiptNumber, panel.done.amount))}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={18} /> Envoyer au parent
            </a>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

function CollectSheet({
  detail,
  onClose,
  onDone,
}: {
  detail: StudentDetail;
  onClose: () => void;
  onDone: (done: { paymentId: string; receiptNumber: number; amount: number }) => void;
}) {
  const { summary, student } = detail;
  const due = summary.overdueAmount || summary.nextDue?.remaining || summary.balance;
  const [amount, setAmount] = useState<number | null>(due > 0 ? due : null);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [fatal, setFatal] = useState<string | null>(null);
  const mutation = useStudentMutation((body: object) =>
    api.post<StudentDetail & { paymentId: string; receiptNumber: number }>(`/students/${student.id}/payments`, body),
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!amount) return setError('Indiquez le montant reçu.');
    if (amount > summary.balance) return setError(`Il ne reste que ${money(summary.balance)} à payer.`);
    setError(undefined);
    try {
      const res = await mutation.mutateAsync({ amount, method, reference: reference || null });
      onDone({ paymentId: res.paymentId, receiptNumber: res.receiptNumber, amount });
    } catch (err) {
      if (err instanceof ApiError && err.fields.amount) setError(err.fields.amount);
      else setFatal(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <Sheet title={`Encaisser · ${student.firstName} ${student.lastName}`} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        {fatal ? <Alert>{fatal}</Alert> : null}
        <AmountInput label="Montant reçu en francs CFA" value={amount} onChange={setAmount} error={error} autoFocus />
        <div className="chips" style={{ justifyContent: 'center' }}>
          {summary.overdueAmount > 0 ? (
            <button
              type="button"
              className="chip"
              aria-pressed={amount === summary.overdueAmount}
              onClick={() => setAmount(summary.overdueAmount)}
            >
              Le retard ({money(summary.overdueAmount)})
            </button>
          ) : null}
          {summary.nextDue && summary.nextDue.remaining !== summary.overdueAmount ? (
            <button
              type="button"
              className="chip"
              aria-pressed={amount === summary.nextDue.remaining}
              onClick={() => setAmount(summary.nextDue!.remaining)}
            >
              {summary.nextDue.label} ({money(summary.nextDue.remaining)})
            </button>
          ) : null}
          <button
            type="button"
            className="chip"
            aria-pressed={amount === summary.balance}
            onClick={() => setAmount(summary.balance)}
          >
            Toute l’année ({money(summary.balance)})
          </button>
        </div>
        <div className="field">
          <span className="field__label">Moyen de paiement</span>
          <div className="segmented" role="group" aria-label="Moyen de paiement">
            {(['cash', 'momo', 'bank'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}>
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        {method !== 'cash' ? (
          <Field
            label={method === 'momo' ? 'Référence de la transaction' : 'N° de chèque ou de virement'}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={60}
            autoComplete="off"
          />
        ) : null}
        <Button type="submit" block loading={mutation.isPending}>
          Encaisser {amount ? money(amount) : ''} et émettre le reçu
        </Button>
      </form>
    </Sheet>
  );
}

function ShareSheet({ detail, onClose }: { detail: StudentDetail; onClose: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const rotate = useStudentMutation(() => api.post<StudentDetail>(`/students/${detail.student.id}/share-link`));
  const url = portalUrl(detail.student.shareToken);
  return (
    <Sheet title="Portail du parent" onClose={onClose}>
      <div className="form">
        <p className="muted">
          Le parent y voit l’échéancier, ses reçus et peut payer par Mobile Money, sans créer de compte. Il ne peut rien
          modifier.
        </p>
        <div className="input-wrap">
          <input ref={input} readOnly value={url} aria-label="Lien du portail" onFocus={(e) => e.target.select()} />
        </div>
        <Button
          variant="secondary"
          block
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
            } catch {
              input.current?.select();
            }
            toast('Lien copié');
          }}
        >
          <Link2 size={18} /> Copier le lien
        </Button>
        <a className="btn btn--ghost btn--block" href={url} target="_blank" rel="noreferrer">
          Voir comme le parent
        </a>
        <Button
          variant="ghost"
          block
          loading={rotate.isPending}
          onClick={async () => {
            await rotate.mutateAsync();
            toast('Nouveau lien créé, l’ancien ne marche plus');
          }}
        >
          <RefreshCw size={16} /> Renouveler le lien
        </Button>
      </div>
    </Sheet>
  );
}
