import { BookOpen, GraduationCap, LayoutDashboard, Plus, Receipt, Settings, Users, Wallet } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { money, STATE_LABEL } from '../lib/format';
import { useStudents } from '../lib/queries';
import type { Session } from '../lib/types';
import { Sheet } from './Sheet';
import { Logo } from './ui';

type Item = { to: string; label: string; icon: ReactNode; end?: boolean; director?: boolean };

const ITEMS: Item[] = [
  { to: '/app', label: 'Tableau de bord', icon: <LayoutDashboard size={20} />, end: true },
  { to: '/app/eleves', label: 'Élèves', icon: <GraduationCap size={20} /> },
  { to: '/app/caisse', label: 'Caisse du jour', icon: <Wallet size={20} /> },
  { to: '/app/classes', label: 'Classes et tarifs', icon: <BookOpen size={20} /> },
  { to: '/app/equipe', label: 'Équipe', icon: <Users size={20} />, director: true },
  { to: '/app/reglages', label: 'Réglages', icon: <Settings size={20} /> },
];

export function AppShell({ session }: { session: Session }) {
  const [collect, setCollect] = useState(false);
  const items = ITEMS.filter((i) => !i.director || session.user.role === 'director');
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Navigation">
        <NavLink to="/app" className="sidebar__brand">
          <Logo /> Écolage
        </NavLink>
        <div className="sidebar__school">
          <strong>{session.school.name}</strong>
          Année {session.school.yearLabel} · {session.user.role === 'director' ? 'Direction' : 'Caisse'}
        </div>
        <button type="button" className="btn btn--block sidebar__cta" onClick={() => setCollect(true)}>
          <Receipt size={18} /> Encaisser
        </button>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className="nav">
            {i.icon}
            {i.label}
          </NavLink>
        ))}
        <div className="sidebar__foot">Connecté : {session.user.name}</div>
      </aside>

      <div className="shell__main">
        <Outlet context={session} />
      </div>

      <nav className="bottomnav" aria-label="Navigation principale">
        <div className="bottomnav__inner">
          <NavLink to="/app" end>
            <LayoutDashboard size={22} />
            Accueil
          </NavLink>
          <NavLink to="/app/eleves">
            <GraduationCap size={22} />
            Élèves
          </NavLink>
          <button type="button" className="fab" onClick={() => setCollect(true)} aria-label="Encaisser un paiement">
            <Plus size={28} strokeWidth={2.5} />
          </button>
          <NavLink to="/app/caisse">
            <Wallet size={22} />
            Caisse
          </NavLink>
          <NavLink to="/app/reglages">
            <Settings size={22} />
            Plus
          </NavLink>
        </div>
      </nav>
      {collect ? <CollectPicker onClose={() => setCollect(false)} /> : null}
    </div>
  );
}

// « Encaisser » : retrouver l'élève par nom, prénom ou matricule, puis ouvrir sa fiche sur l'encaissement.
function CollectPicker({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const students = useStudents();
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return (students.data ?? [])
      .filter((s) => !s.archived)
      .filter((s) =>
        `${s.lastName} ${s.firstName} ${s.firstName} ${s.lastName} ${s.matricule}`.toLowerCase().includes(term),
      )
      .slice(0, 8);
  }, [students.data, q]);

  return (
    <Sheet title="Encaisser pour quel élève ?" onClose={onClose}>
      <div className="input-wrap" style={{ marginBottom: 12 }}>
        <input
          type="search"
          placeholder="Nom, prénom ou matricule"
          aria-label="Rechercher un élève"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {q.trim() && results.length === 0 ? <p className="muted">Aucun élève trouvé.</p> : null}
      {results.length > 0 ? (
        <ul className="list card">
          {results.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="row"
                onClick={() => {
                  onClose();
                  navigate(`/app/eleves/${s.id}?encaisser=1`);
                }}
              >
                <span className="row__main">
                  <span className="row__title" style={{ display: 'block' }}>
                    {s.lastName} {s.firstName}
                  </span>
                  <span className="row__sub" style={{ display: 'block' }}>
                    {s.className} · {s.matricule}
                  </span>
                </span>
                <span className="row__end">
                  <span className="row__amount num" style={{ display: 'block' }}>
                    {s.balance > 0 ? money(s.balance) : '—'}
                  </span>
                  <span
                    className={`badge badge--${s.state === 'late' ? 'overdue' : s.state === 'settled' ? 'paid' : 'due'}`}
                  >
                    {STATE_LABEL[s.state]}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Sheet>
  );
}
