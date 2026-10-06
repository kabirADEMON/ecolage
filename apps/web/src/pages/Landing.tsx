import { FileSpreadsheet, MessageCircle, ReceiptText, ShieldCheck, Smartphone, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { Logo } from '../components/ui';
import { money, percent } from '../lib/format';
import { useSession } from '../lib/session';
import { DemoButton } from './Auth';

const CLASSES = [
  { name: 'CI', rate: 0.82 },
  { name: 'CM2', rate: 0.64 },
  { name: '6e', rate: 0.71 },
  { name: '3e', rate: 0.48 },
];

export function Landing() {
  const me = useSession();
  return (
    <div className="landing">
      <nav className="landing__nav">
        <Link to="/" className="auth__brand" style={{ margin: 0 }}>
          <Logo /> Écolage
        </Link>
        {me.data ? (
          <Link className="btn btn--primary btn--sm" to="/app">
            Ouvrir mon école
          </Link>
        ) : (
          <Link className="btn btn--secondary btn--sm" to="/connexion">
            Se connecter
          </Link>
        )}
      </nav>

      <section className="landing__hero">
        <div>
          <h1>
            La scolarité de votre école, <em>sans cahier ni reçu perdu.</em>
          </h1>
          <p className="landing__lead">
            Échéancier par classe, reçus numérotés imprimés au guichet, journal de caisse à la fin de la journée, et un
            portail où chaque parent voit ce qu’il reste à payer et règle en Mobile Money.
          </p>
          <div className="landing__ctas">
            <Link className="btn btn--primary" to={me.data ? '/app' : '/inscription'}>
              {me.data ? 'Ouvrir mon école' : 'Créer l’espace de mon école'}
            </Link>
            <div style={{ minWidth: 280 }}>
              <DemoButton />
            </div>
          </div>
          <p className="landing__proof">
            Pour les écoles primaires, collèges et lycées privés. Direction et caissiers, chacun son accès.
          </p>
        </div>

        <div className="card card--pad" aria-hidden="true" style={{ boxShadow: 'var(--shadow)' }}>
          <div className="kpi kpi--brand card" style={{ marginBottom: 12 }}>
            <p className="kpi__label">Recouvrement 2026-2027</p>
            <p className="kpi__value num">{percent(0.66)}</p>
            <div className="progress progress--light" style={{ marginTop: 10 }}>
              <span style={{ width: '66%' }} />
            </div>
            <p className="kpi__sub num">
              {money(6_930_000)} sur {money(10_500_000)}
            </p>
          </div>
          <table className="table">
            <tbody>
              {CLASSES.map((c) => (
                <tr key={c.name}>
                  <td style={{ width: 60 }}>
                    <strong>{c.name}</strong>
                  </td>
                  <td>
                    <div className="progress">
                      <span style={{ width: `${c.rate * 100}%` }} />
                    </div>
                  </td>
                  <td className="right num" style={{ width: 60 }}>
                    {percent(c.rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="features">
        <article className="card feature">
          <span className="feature__icon">
            <ReceiptText size={22} />
          </span>
          <h3>Des reçus qui ne mentent pas</h3>
          <p>
            Numérotés sans trou, montant en lettres, imprimés en A5. Un reçu s’annule avec un motif et reste visible,
            barré : impossible de le faire disparaître.
          </p>
        </article>
        <article className="card feature">
          <span className="feature__icon">
            <Wallet size={22} />
          </span>
          <h3>La caisse juste, chaque soir</h3>
          <p>
            Le journal du jour donne le total par mode de paiement et ce que chaque caissier doit remettre, prêt à
            imprimer.
          </p>
        </article>
        <article className="card feature">
          <span className="feature__icon">
            <Smartphone size={22} />
          </span>
          <h3>Les parents paient sans se déplacer</h3>
          <p>
            Chaque parent a un lien vers l’échéancier et les reçus de son enfant, et paie par MTN MoMo ou Moov Money. Le
            reçu est émis tout seul.
          </p>
        </article>
      </div>

      <h2>Ce qui change pour la direction</h2>
      <div className="features">
        <article className="card feature">
          <span className="feature__icon">
            <MessageCircle size={22} />
          </span>
          <h3>Relancer sans gêne</h3>
          <p>
            La liste des retards par classe, et un message WhatsApp courtois déjà rédigé pour chaque parent concerné.
          </p>
        </article>
        <article className="card feature">
          <span className="feature__icon">
            <FileSpreadsheet size={22} />
          </span>
          <h3>Démarrer en dix minutes</h3>
          <p>
            Vos classes et leurs tranches, puis la liste des élèves collée depuis Excel. Les matricules sont attribués
            automatiquement.
          </p>
        </article>
        <article className="card feature">
          <span className="feature__icon">
            <ShieldCheck size={22} />
          </span>
          <h3>Chacun son rôle</h3>
          <p>
            Les caissiers encaissent. Les tarifs, les réductions, les annulations et l’équipe restent entre les mains de
            la direction.
          </p>
        </article>
      </div>

      <footer className="landing__footer">
        <span>Écolage · fait au Bénin</span>
        <a href="https://github.com/kabirADEMON/ecolage" target="_blank" rel="noreferrer">
          Code source
        </a>
      </footer>
    </div>
  );
}
