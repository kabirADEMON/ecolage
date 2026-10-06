import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Ban, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ReceiptView } from '../components/ReceiptView';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { Alert, Button, Field, Skeleton } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { addDays, longDay, METHOD_LABEL, money, today } from '../lib/format';
import { useCash, useInvalidateAll, useIsDirector } from '../lib/queries';
import type { Receipt } from '../lib/types';

export function ReceiptPage() {
  const { id = '' } = useParams();
  const director = useIsDirector();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [cancelling, setCancelling] = useState(false);
  const query = useQuery({ queryKey: ['receipt', id], queryFn: () => api.get<Receipt>(`/payments/${id}/receipt`) });

  // Arrivée depuis « Imprimer le reçu » : la boîte d'impression s'ouvre directement.
  useEffect(() => {
    if (query.data && params.get('imprimer')) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [query.data, params]);

  const r = query.data;
  return (
    <>
      <header className="topbar">
        <button type="button" className="btn btn--ghost btn--icon" aria-label="Retour" onClick={() => navigate(-1)}>
          <ArrowLeft size={22} />
        </button>
        <div className="topbar__title">{r ? `Reçu n° ${r.receiptNumber}` : 'Reçu'}</div>
      </header>
      <main className="page">
        {query.isError ? <Alert>{query.error.message}</Alert> : null}
        {!r ? (
          <Skeleton height={420} />
        ) : (
          <>
            <div className="btn-row no-print">
              <Button onClick={() => window.print()}>
                <Printer size={18} /> Imprimer
              </Button>
              <Link className="btn btn--secondary" to={`/app/eleves/${r.student.id}`}>
                Fiche de l’élève
              </Link>
              {director && !r.cancelled && !r.online ? (
                <Button variant="ghost" onClick={() => setCancelling(true)}>
                  <Ban size={18} /> Annuler ce reçu
                </Button>
              ) : null}
            </div>
            <ReceiptView r={r} />
          </>
        )}
      </main>
      {cancelling && r ? <CancelSheet receipt={r} onClose={() => setCancelling(false)} /> : null}
    </>
  );
}

function CancelSheet({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidateAll();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/payments/${receipt.id}/cancel`, { reason });
      invalidate();
      toast(`Reçu n° ${receipt.receiptNumber} annulé`);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.reason ?? err.message) : 'Erreur');
      setLoading(false);
    }
  };
  return (
    <Sheet title={`Annuler le reçu n° ${receipt.receiptNumber} ?`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {error ? <Alert>{error}</Alert> : null}
        <p className="muted">
          Le reçu de {money(receipt.amount)} reste dans la caisse, barré, avec votre nom et le motif. Son numéro ne sera
          jamais réutilisé. Faites-le seulement si l’argent n’a pas été reçu ou a été rendu.
        </p>
        <Field
          label="Motif"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={140}
          placeholder="Ex. saisi sur le mauvais élève"
          autoFocus
        />
        <Button type="submit" variant="danger" block loading={loading} disabled={reason.trim().length < 3}>
          Annuler le reçu
        </Button>
      </form>
    </Sheet>
  );
}

// Journal de caisse : ce que chaque caissier doit remettre en fin de journée.
export function Cash() {
  const [params, setParams] = useSearchParams();
  const day = params.get('date') ?? today();
  const query = useCash(day);
  const navigate = useNavigate();
  const j = query.data;
  const go = (d: string) => setParams(d === today() ? {} : { date: d }, { replace: true });

  return (
    <>
      <header className="topbar">
        <div className="topbar__title">Caisse</div>
        <Button variant="secondary" size="sm" onClick={() => window.print()} className="no-print">
          <Printer size={16} /> Imprimer
        </Button>
      </header>
      <main className="page print-sheet">
        <div className="toolbar no-print">
          <Button variant="secondary" size="sm" onClick={() => go(addDays(day, -1))} aria-label="Jour précédent">
            <ChevronLeft size={18} />
          </Button>
          <input
            type="date"
            aria-label="Date"
            value={day}
            max={today()}
            onChange={(e) => e.target.value && go(e.target.value)}
            style={{
              minHeight: 40,
              padding: '0 10px',
              border: '1.5px solid var(--line)',
              borderRadius: 10,
              background: 'var(--surface)',
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => go(addDays(day, 1))}
            disabled={day >= today()}
            aria-label="Jour suivant"
          >
            <ChevronRight size={18} />
          </Button>
        </div>
        <h1 className="page-title">Journal de caisse du {longDay(day)}</h1>

        {!j ? (
          <Skeleton height={300} />
        ) : (
          <>
            <section className="kpis">
              <div className="card kpi kpi--brand">
                <p className="kpi__label">Total encaissé</p>
                <p className="kpi__value num" data-testid="cash-total">
                  {money(j.total)}
                </p>
                <p className="kpi__sub">
                  {j.count} reçu{j.count > 1 ? 's' : ''}
                  {j.cancelledCount ? ` · ${j.cancelledCount} annulé${j.cancelledCount > 1 ? 's' : ''}` : ''}
                </p>
              </div>
              {(['cash', 'momo', 'bank'] as const).map((m) => (
                <div className="card kpi" key={m}>
                  <p className="kpi__label">{METHOD_LABEL[m]}</p>
                  <p className="kpi__value num">{money(j.byMethod[m])}</p>
                </div>
              ))}
            </section>

            {j.byCashier.length > 0 ? (
              <>
                <h2 className="section-title">À remettre par caissier</h2>
                <div className="card table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Caisse</th>
                        <th className="right">Reçus</th>
                        <th className="right">Dont espèces</th>
                        <th className="right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {j.byCashier.map((c) => (
                        <tr key={c.name}>
                          <td>{c.name}</td>
                          <td className="right num">{c.count}</td>
                          <td className="right num">{money(c.cash)}</td>
                          <td className="right num">
                            <strong>{money(c.total)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            <h2 className="section-title">Reçus de la journée</h2>
            {j.payments.length === 0 ? (
              <div className="card card--pad muted">Aucun encaissement ce jour-là.</div>
            ) : (
              <div className="card table-wrap">
                <table className="table" aria-label="Reçus de la journée">
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Heure</th>
                      <th>Élève</th>
                      <th>Mode</th>
                      <th>Caisse</th>
                      <th className="right">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {j.payments.map((p) => (
                      <tr
                        key={p.id}
                        className={`clickable ${p.cancelled ? 'is-cancelled' : ''}`}
                        onClick={() => navigate(`/app/recus/${p.id}`)}
                      >
                        <td className="num">{p.receiptNumber}</td>
                        <td className="num">
                          {new Date(p.createdAt).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Africa/Porto-Novo',
                          })}
                        </td>
                        <td>
                          {p.studentName} <span className="muted">· {p.className}</span>
                          {p.cancelled ? <div style={{ fontSize: '0.8rem' }}>Annulé : {p.cancelReason}</div> : null}
                        </td>
                        <td>{METHOD_LABEL[p.method]}</td>
                        <td>{p.online ? 'En ligne' : p.cashierName}</td>
                        <td className="right num amount">{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={5}>Total (hors reçus annulés)</td>
                      <td className="right num">{money(j.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
