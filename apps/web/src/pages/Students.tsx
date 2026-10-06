import { Download, FileUp, Search, UserPlus } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { Alert, Button, Empty, Field, Skeleton } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { money, normalizePhone, STATE_LABEL } from '../lib/format';
import { useClasses, useInvalidateAll, useIsDirector, useStudentMutation, useStudents } from '../lib/queries';
import type { FeeState, SchoolClass, StudentDetail } from '../lib/types';

const STATES: { id: FeeState | ''; label: string }[] = [
  { id: '', label: 'Tous' },
  { id: 'late', label: 'En retard' },
  { id: 'on_track', label: 'À jour' },
  { id: 'settled', label: 'Soldés' },
];

export function Students() {
  const director = useIsDirector();
  const students = useStudents();
  const classes = useClasses();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const q = params.get('q') ?? '';
  const classId = params.get('classe') ?? '';
  const state = (params.get('statut') ?? '') as FeeState | '';

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (students.data ?? [])
      .filter((s) => !s.archived)
      .filter((s) => !classId || s.classId === classId)
      .filter((s) => !state || s.state === state)
      .filter(
        (s) => !term || `${s.lastName} ${s.firstName} ${s.matricule} ${s.parentName}`.toLowerCase().includes(term),
      );
  }, [students.data, q, classId, state]);

  const totalDue = list.reduce((sum, s) => sum + Math.max(s.balance, 0), 0);

  return (
    <>
      <header className="topbar">
        <div className="topbar__title">Élèves</div>
        {director ? (
          <Link className="btn btn--secondary btn--sm" to="/app/eleves/importer">
            <FileUp size={16} /> Importer
          </Link>
        ) : null}
        <Button size="sm" onClick={() => setCreating(true)} disabled={!classes.data?.length}>
          <UserPlus size={16} /> Inscrire
        </Button>
      </header>
      <main className="page">
        <div className="toolbar">
          <div className="input-wrap">
            <span className="input-wrap__affix" aria-hidden="true">
              <Search size={18} />
            </span>
            <input
              type="search"
              placeholder="Nom, matricule ou parent"
              aria-label="Rechercher un élève"
              value={q}
              onChange={(e) => update('q', e.target.value)}
            />
          </div>
          <select aria-label="Classe" value={classId} onChange={(e) => update('classe', e.target.value)}>
            <option value="">Toutes les classes</option>
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="chips" style={{ marginBottom: 14 }} role="group" aria-label="Situation">
          {STATES.map((s) => (
            <button
              key={s.id}
              type="button"
              className="chip"
              aria-pressed={state === s.id}
              onClick={() => update('statut', s.id)}
            >
              {s.label}
            </button>
          ))}
          <a
            className="chip"
            href="/api/export/impayes.csv"
            download
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
          >
            <Download size={14} /> Liste des impayés (CSV)
          </a>
        </div>

        {students.isPending ? (
          <Skeleton height={320} />
        ) : !classes.data?.length ? (
          <div className="card">
            <Empty icon={<UserPlus size={26} />} title="Créez d’abord vos classes">
              <p>Chaque élève est inscrit dans une classe, qui porte son échéancier.</p>
              <Link className="btn btn--primary" to="/app/classes">
                Créer les classes
              </Link>
            </Empty>
          </div>
        ) : list.length === 0 ? (
          <div className="card">
            <Empty
              icon={<UserPlus size={26} />}
              title={students.data?.length ? 'Aucun élève ne correspond' : 'Aucun élève inscrit'}
            >
              {students.data?.length ? <p>Changez la recherche ou les filtres.</p> : null}
            </Empty>
          </div>
        ) : (
          <div className="card table-wrap">
            <table className="table" aria-label="Liste des élèves">
              <thead>
                <tr>
                  <th>Élève</th>
                  <th>Classe</th>
                  <th>Parent</th>
                  <th className="right">Payé</th>
                  <th className="right">Reste</th>
                  <th>Situation</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="clickable" onClick={() => navigate(`/app/eleves/${s.id}`)}>
                    <td>
                      <Link
                        to={`/app/eleves/${s.id}`}
                        style={{ textDecoration: 'none', fontWeight: 600 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {s.lastName} {s.firstName}
                      </Link>
                      <div className="muted num" style={{ fontSize: '0.8rem' }}>
                        {s.matricule}
                      </div>
                    </td>
                    <td>{s.className}</td>
                    <td className="muted">{s.parentName}</td>
                    <td className="right num">{money(s.totalPaid)}</td>
                    <td className="right num" style={{ fontWeight: 700 }}>
                      {s.balance > 0 ? money(s.balance) : '—'}
                    </td>
                    <td>
                      <span
                        className={`badge badge--${s.state === 'late' ? 'overdue' : s.state === 'settled' ? 'paid' : 'due'}`}
                      >
                        {s.state === 'late' ? `${money(s.overdueAmount)} en retard` : STATE_LABEL[s.state]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>
                    {list.length} élève{list.length > 1 ? 's' : ''}
                  </td>
                  <td className="right num">{money(totalDue)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </main>
      {creating && classes.data ? (
        <StudentForm
          classes={classes.data}
          defaultClassId={classId}
          onClose={() => setCreating(false)}
          onSaved={(d) => navigate(`/app/eleves/${d.student.id}`)}
        />
      ) : null}
    </>
  );
}

export function StudentForm({
  classes,
  detail,
  defaultClassId,
  onClose,
  onSaved,
}: {
  classes: SchoolClass[];
  detail?: StudentDetail;
  defaultClassId?: string;
  onClose: () => void;
  onSaved?: (d: StudentDetail) => void;
}) {
  const director = useIsDirector();
  const toast = useToast();
  const s = detail?.student;
  const [form, setForm] = useState({
    lastName: s?.lastName ?? '',
    firstName: s?.firstName ?? '',
    // Filtre de classe vide (« Toutes les classes ») : on propose la première classe.
    classId: s?.classId || defaultClassId || classes[0]?.id || '',
    parentName: s?.parentName ?? '',
    parentPhone: s?.parentPhone ? s.parentPhone.replace(/(\d{2})(?=\d)/g, '$1 ') : '',
    discount: s?.discount ? String(s.discount) : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useStudentMutation((body: object) =>
    s ? api.patch<StudentDetail>(`/students/${s.id}`, body) : api.post<StudentDetail>('/students', body),
  );
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.lastName.trim().length < 2) next.lastName = 'Nom requis.';
    if (form.firstName.trim().length < 2) next.firstName = 'Prénom requis.';
    if (form.parentName.trim().length < 2) next.parentName = 'Nom du parent requis.';
    if (form.parentPhone.trim() && !normalizePhone(form.parentPhone)) next.parentPhone = 'Numéro béninois invalide.';
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      const saved = await mutation.mutateAsync({
        lastName: form.lastName,
        firstName: form.firstName,
        classId: form.classId,
        parentName: form.parentName,
        parentPhone: form.parentPhone.trim() ? normalizePhone(form.parentPhone) : null,
        discount: Number(form.discount.replace(/\D/g, '') || 0),
      });
      toast(s ? 'Fiche mise à jour' : `${saved.student.firstName} inscrit(e) · matricule ${saved.student.matricule}`);
      onClose();
      onSaved?.(saved);
    } catch (err) {
      if (err instanceof ApiError) setErrors(Object.keys(err.fields).length ? err.fields : { _: err.message });
    }
  };

  return (
    <Sheet title={s ? 'Modifier la fiche' : 'Inscrire un élève'} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        {errors._ ? <Alert>{errors._}</Alert> : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field
            label="Nom"
            value={form.lastName}
            onChange={set('lastName')}
            error={errors.lastName}
            autoComplete="off"
            maxLength={80}
          />
          <Field
            label="Prénom(s)"
            value={form.firstName}
            onChange={set('firstName')}
            error={errors.firstName}
            autoComplete="off"
            maxLength={80}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="student-class">
            Classe
          </label>
          <div className="input-wrap">
            <select id="student-class" value={form.classId} onChange={set('classId')} disabled={!!s && !director}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {money(c.total)}
                </option>
              ))}
            </select>
          </div>
          {errors.classId ? <p className="field__error">{errors.classId}</p> : null}
        </div>
        <Field
          label="Parent ou tuteur"
          value={form.parentName}
          onChange={set('parentName')}
          error={errors.parentName}
          placeholder="Ex. M. Houngbo"
          maxLength={80}
        />
        <Field
          label="WhatsApp du parent"
          prefix="+229"
          inputMode="tel"
          value={form.parentPhone}
          onChange={set('parentPhone')}
          error={errors.parentPhone}
          placeholder="01 97 12 34 56"
          hint="Pour les rappels et l’envoi des reçus."
        />
        {director ? (
          <Field
            label="Réduction accordée (facultatif)"
            suffix="F"
            inputMode="numeric"
            value={form.discount}
            onChange={set('discount')}
            error={errors.discount}
            hint="Fratrie, bourse… retirée des dernières tranches."
          />
        ) : null}
        <Button type="submit" block loading={mutation.isPending}>
          {s ? 'Enregistrer' : 'Inscrire l’élève'}
        </Button>
      </form>
    </Sheet>
  );
}

export function ImportStudents() {
  const navigate = useNavigate();
  const toast = useToast();
  const classes = useClasses();
  const invalidate = useInvalidateAll();
  const [csv, setCsv] = useState('');
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors([]);
    setMessage(null);
    try {
      const res = await api.post<{ imported: number }>('/students/import', { csv });
      invalidate();
      toast(`${res.imported} élève(s) importé(s)`);
      navigate('/app/eleves');
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.lines);
      }
    } finally {
      setLoading(false);
    }
  };

  const readFile = async (file: File | undefined) => {
    if (file) setCsv(await file.text());
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar__title">Importer des élèves</div>
      </header>
      <main className="page">
        <form className="card card--pad form" onSubmit={submit}>
          <p>
            Copiez votre liste depuis Excel (ou choisissez un fichier CSV), une ligne par élève, colonnes séparées par
            des points-virgules : <strong>Nom ; Prénom ; Classe ; Parent ; Téléphone</strong>.
          </p>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            Classes reconnues : {classes.data?.map((c) => c.name).join(', ') || 'aucune pour le moment'}. Si une seule
            ligne est invalide, rien n’est importé : corrigez-la et recommencez.
          </p>
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            aria-label="Fichier CSV"
            onChange={(e) => readFile(e.target.files?.[0])}
          />
          <div className="field">
            <label className="field__label" htmlFor="csv">
              Liste
            </label>
            <textarea
              id="csv"
              rows={10}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={'Nom;Prénom;Classe;Parent;Téléphone\nDOSSOU;Rodrigue;CM2;M. Dossou;97 00 00 01'}
              style={{
                padding: 12,
                border: '1.5px solid var(--line)',
                borderRadius: 10,
                background: 'var(--surface)',
                fontFamily: 'ui-monospace, Consolas, monospace',
              }}
            />
          </div>
          {message ? (
            <Alert>
              {message}
              {errors.length ? (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {errors.map((e) => (
                    <li key={e.line}>
                      Ligne {e.line} : {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          ) : null}
          <Button type="submit" loading={loading} disabled={!csv.trim()}>
            <FileUp size={18} /> Importer
          </Button>
        </form>
      </main>
    </>
  );
}
