import { AlertTriangle, BookOpen, CalendarDays, GraduationCap, TrendingUp, Wallet } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Empty, Skeleton } from '../components/ui';
import { money, percent, plural, when } from '../lib/format';
import { useAppSession, useDashboard, useIsDirector } from '../lib/queries';

export function Dashboard() {
  const { school, user } = useAppSession();
  const director = useIsDirector();
  const navigate = useNavigate();
  const q = useDashboard();
  const d = q.data;

  return (
    <>
      <header className="topbar">
        <div className="topbar__title">{school.name}</div>
        {school.isDemo ? <span className="badge badge--demo">Démo</span> : null}
      </header>
      <main className="page">
        <h1 className="page-title">Bonjour {user.name.replace(/^(M\.|Mme|Mlle)\s+/, '')}</h1>

        {!d ? (
          <div className="kpis">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={110} />
            ))}
          </div>
        ) : d.studentsCount === 0 ? (
          <div className="card">
            <Empty icon={<GraduationCap size={26} />} title="Votre école est prête">
              <p>
                {director
                  ? 'Commencez par créer vos classes avec leurs tarifs, puis inscrivez ou importez vos élèves.'
                  : 'La direction n’a pas encore inscrit d’élèves.'}
              </p>
              {director ? (
                <Link className="btn btn--primary" to="/app/classes">
                  <BookOpen size={18} /> Créer les classes
                </Link>
              ) : null}
            </Empty>
          </div>
        ) : (
          <>
            <section className="kpis" aria-label="Indicateurs">
              <div className="card kpi kpi--brand">
                <p className="kpi__label">
                  <TrendingUp size={16} aria-hidden="true" /> Recouvrement {school.yearLabel}
                </p>
                <p className="kpi__value num" data-testid="rate">
                  {percent(d.rate)}
                </p>
                <div className="progress progress--light" style={{ marginTop: 10 }}>
                  <span style={{ width: `${Math.min(100, d.rate * 100)}%` }} />
                </div>
                <p className="kpi__sub num">
                  {money(d.collected)} sur {money(d.expected)}
                </p>
              </div>
              <div className="card kpi">
                <p className="kpi__label">
                  <Wallet size={16} aria-hidden="true" /> Encaissé aujourd’hui
                </p>
                <p className="kpi__value num" data-testid="today">
                  {money(d.collectedToday)}
                </p>
                <p className="kpi__sub">
                  <Link to="/app/caisse">Voir la caisse du jour</Link>
                </p>
              </div>
              <div className="card kpi">
                <p className="kpi__label">
                  <CalendarDays size={16} aria-hidden="true" /> Encaissé ce mois
                </p>
                <p className="kpi__value num">{money(d.collectedThisMonth)}</p>
                <p className="kpi__sub">{plural(d.settledCount, 'élève soldé', 'élèves soldés')}</p>
              </div>
              <div className="card kpi">
                <p className="kpi__label">
                  <AlertTriangle size={16} aria-hidden="true" /> Impayés échus
                </p>
                <p
                  className="kpi__value num"
                  style={{ color: d.overdueAmount ? 'var(--danger)' : undefined }}
                  data-testid="overdue"
                >
                  {money(d.overdueAmount)}
                </p>
                <p className="kpi__sub">{plural(d.lateCount, 'élève en retard', 'élèves en retard')}</p>
              </div>
            </section>

            <div className="two-cols" style={{ marginTop: 8 }}>
              <section>
                <h2 className="section-title">Par classe</h2>
                <div className="card table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Classe</th>
                        <th className="right">Élèves</th>
                        <th>Recouvrement</th>
                        <th className="right">En retard</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.perClass.map((c) => (
                        <tr key={c.id} className="clickable" onClick={() => navigate(`/app/eleves?classe=${c.id}`)}>
                          <td>
                            <strong>{c.name}</strong>
                          </td>
                          <td className="right num">{c.students}</td>
                          <td style={{ minWidth: 160 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div className="progress" style={{ flex: 1 }}>
                                <span style={{ width: `${Math.min(100, c.rate * 100)}%` }} />
                              </div>
                              <span className="num" style={{ fontSize: '0.85rem', width: 44, textAlign: 'right' }}>
                                {percent(c.rate)}
                              </span>
                            </div>
                          </td>
                          <td className="right num" style={{ color: c.overdue ? 'var(--danger)' : 'var(--faint)' }}>
                            {c.overdue ? money(c.overdue) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h2 className="section-title">
                  Plus gros retards <Link to="/app/eleves?statut=late">Tout voir</Link>
                </h2>
                {d.topLate.length === 0 ? (
                  <div className="card card--pad muted">Aucun retard. Bravo !</div>
                ) : (
                  <ul className="list card">
                    {d.topLate.map((s) => (
                      <li key={s.id}>
                        <Link className="row" to={`/app/eleves/${s.id}`}>
                          <div className="row__main">
                            <div className="row__title">
                              {s.lastName} {s.firstName}
                            </div>
                            <div className="row__sub">
                              {s.className} · {s.parentName}
                            </div>
                          </div>
                          <span className="badge badge--overdue num">{money(s.overdueAmount)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                <h2 className="section-title">Derniers reçus</h2>
                <ul className="list card">
                  {d.recent.map((p) => (
                    <li key={p.id}>
                      <Link className="row" to={`/app/recus/${p.id}`}>
                        <div className="row__main">
                          <div className="row__title">
                            N° {p.receiptNumber} · {p.studentName}
                          </div>
                          <div className="row__sub">
                            {when(p.createdAt)} · {p.online ? 'En ligne' : (p.cashierName ?? '')}
                          </div>
                        </div>
                        <span
                          className={`row__amount num ${p.cancelled ? 'muted' : ''}`}
                          style={p.cancelled ? { textDecoration: 'line-through' } : undefined}
                        >
                          {money(p.amount)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}
      </main>
    </>
  );
}
