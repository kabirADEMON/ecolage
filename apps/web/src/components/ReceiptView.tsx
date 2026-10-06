import { METHOD_LABEL, dateTime, money, phone } from '../lib/format';
import type { Receipt } from '../lib/types';

// Reçu au format A5, imprimable tel quel. Le montant est aussi écrit en lettres,
// comme sur les reçus manuscrits que les parents connaissent.
export function ReceiptView({ r }: { r: Receipt }) {
  return (
    <article className="receipt" aria-label={`Reçu n° ${r.receiptNumber}`}>
      <header className="receipt__head">
        <div>
          <div className="receipt__school">{r.school.name}</div>
          <div>{r.school.city}</div>
          {r.school.phone ? <div>Tél. +229 {phone(r.school.phone)}</div> : null}
        </div>
        <div className="receipt__number">
          Reçu de scolarité
          <strong data-testid="receipt-number">N° {String(r.receiptNumber).padStart(6, '0')}</strong>
          Année {r.school.yearLabel}
        </div>
      </header>

      <dl className="receipt__grid">
        <div>
          <dt>Élève</dt>
          <dd>{r.student.name}</dd>
        </div>
        <div>
          <dt>Classe · matricule</dt>
          <dd>
            {r.student.className} · {r.student.matricule}
          </dd>
        </div>
        <div>
          <dt>Reçu de</dt>
          <dd>{r.student.parentName}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{dateTime(r.createdAt)}</dd>
        </div>
        <div>
          <dt>Mode de paiement</dt>
          <dd>
            {METHOD_LABEL[r.method]}
            {r.reference ? ` · réf. ${r.reference}` : ''}
          </dd>
        </div>
        <div>
          <dt>Reste à payer après ce reçu</dt>
          <dd className="num">{money(Math.max(r.balanceAfter, 0))}</dd>
        </div>
      </dl>

      <div className="receipt__amount">
        <strong className="num" data-testid="receipt-amount">
          {money(r.amount)}
        </strong>
        <div className="receipt__words">Arrêté le présent reçu à la somme de {r.amountInWords} francs CFA.</div>
      </div>

      {r.cancelled ? (
        <p className="receipt__stamp" data-testid="receipt-cancelled">
          Reçu annulé le {dateTime(r.cancelled.at)}
          {r.cancelled.by ? ` par ${r.cancelled.by}` : ''} · {r.cancelled.reason}
        </p>
      ) : null}

      <div className="receipt__sign">
        <span>{r.online ? 'Paiement Mobile Money en ligne' : `Caisse : ${r.cashierName ?? ''}`}</span>
        <span>Cachet et signature</span>
      </div>
    </article>
  );
}
