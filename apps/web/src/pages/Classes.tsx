import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { Alert, Button, Empty, Field, Skeleton } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { addDays, dueLabel, money, today } from '../lib/format';
import { useClasses, useInvalidateAll, useIsDirector } from '../lib/queries';
import type { SchoolClass } from '../lib/types';

export function Classes() {
  const director = useIsDirector();
  const classes = useClasses();
  const [editing, setEditing] = useState<SchoolClass | 'new' | null>(null);

  return (
    <>
      <header className="topbar">
        <div className="topbar__title">Classes et tarifs</div>
        {director ? (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus size={16} /> Nouvelle classe
          </Button>
        ) : null}
      </header>
      <main className="page">
        {!classes.data ? (
          <Skeleton height={300} />
        ) : classes.data.length === 0 ? (
          <div className="card">
            <Empty icon={<BookOpen size={26} />} title="Aucune classe">
              <p>Une classe porte son échéancier : inscription, puis tranches avec leur date limite.</p>
              {director ? (
                <Button onClick={() => setEditing('new')}>
                  <Plus size={18} /> Créer la première classe
                </Button>
              ) : null}
            </Empty>
          </div>
        ) : (
          <div className="card table-wrap">
            <table className="table" aria-label="Classes">
              <thead>
                <tr>
                  <th>Classe</th>
                  <th>Échéancier</th>
                  <th className="right">Total annuel</th>
                  <th className="right">Élèves</th>
                  {director ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {classes.data.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/app/eleves?classe=${c.id}`} style={{ fontWeight: 700, textDecoration: 'none' }}>
                        {c.name}
                      </Link>
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>
                      {c.installments.map((i) => (
                        <div key={i.id}>
                          {i.label} : <span className="num">{money(i.amount)}</span>{' '}
                          <span className="muted">avant le {dueLabel(i.dueDate)}</span>
                        </div>
                      ))}
                    </td>
                    <td className="right num">
                      <strong>{money(c.total)}</strong>
                    </td>
                    <td className="right num">{c.studentsCount}</td>
                    {director ? (
                      <td className="right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(c)}
                          aria-label={`Modifier ${c.name}`}
                        >
                          <Pencil size={16} />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      {editing ? <ClassEditor cls={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

type Row = { label: string; amount: string; dueDate: string };

function defaultRows(): Row[] {
  const t = today();
  return [
    { label: 'Inscription', amount: '', dueDate: addDays(t, 7) },
    { label: 'Tranche 1', amount: '', dueDate: addDays(t, 45) },
    { label: 'Tranche 2', amount: '', dueDate: addDays(t, 120) },
    { label: 'Tranche 3', amount: '', dueDate: addDays(t, 200) },
  ];
}

function ClassEditor({ cls, onClose }: { cls: SchoolClass | null; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidateAll();
  const [name, setName] = useState(cls?.name ?? '');
  const [rows, setRows] = useState<Row[]>(
    cls
      ? cls.installments.map((i) => ({ label: i.label, amount: String(i.amount), dueDate: i.dueDate }))
      : defaultRows(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const total = rows.reduce((s, r) => s + Number(r.amount.replace(/\D/g, '') || 0), 0);

  const setRow = (i: number, key: keyof Row, value: string) =>
    setRows((list) =>
      list.map((r, j) => (j === i ? { ...r, [key]: key === 'amount' ? value.replace(/\D/g, '') : value } : r)),
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const body = {
      name,
      installments: rows.map((r) => ({ label: r.label, amount: Number(r.amount || 0), dueDate: r.dueDate })),
    };
    try {
      if (cls) await api.put(`/classes/${cls.id}`, body);
      else await api.post('/classes', body);
      invalidate();
      toast(cls ? `${name} mise à jour` : `Classe ${name} créée`);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(Object.keys(err.fields).length ? err.fields : { _: err.message });
      setLoading(false);
    }
  };

  const remove = async () => {
    if (!cls) return;
    try {
      await api.delete(`/classes/${cls.id}`);
      invalidate();
      toast(`Classe ${cls.name} supprimée`);
      onClose();
    } catch (err) {
      setErrors({ _: err instanceof Error ? err.message : 'Erreur' });
    }
  };

  return (
    <Sheet title={cls ? `Modifier ${cls.name}` : 'Nouvelle classe'} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        {errors._ ? <Alert>{errors._}</Alert> : null}
        {cls && cls.studentsCount > 0 ? (
          <Alert tone="info">
            Les {cls.studentsCount} élèves de la classe seront recalculés avec le nouvel échéancier. Les paiements déjà
            reçus sont conservés.
          </Alert>
        ) : null}
        <Field
          label="Nom de la classe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          placeholder="Ex. CM2, 6e A"
          maxLength={30}
        />
        <div className="field">
          <span className="field__label">Échéancier</span>
          {rows.map((r, i) => (
            <div className="installment-row" key={i}>
              <Field
                label={`Libellé ${i + 1}`}
                value={r.label}
                onChange={(e) => setRow(i, 'label', e.target.value)}
                error={errors[`installments.${i}.label`]}
                maxLength={40}
              />
              <Field
                label="Montant"
                suffix="F"
                inputMode="numeric"
                value={r.amount}
                onChange={(e) => setRow(i, 'amount', e.target.value)}
                error={errors[`installments.${i}.amount`]}
              />
              <Field
                label="Avant le"
                type="date"
                value={r.dueDate}
                onChange={(e) => setRow(i, 'dueDate', e.target.value)}
                error={errors[`installments.${i}.dueDate`]}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Retirer ${r.label || `l’échéance ${i + 1}`}`}
                disabled={rows.length === 1}
                onClick={() => setRows((list) => list.filter((_, j) => j !== i))}
                style={{ marginBottom: 6 }}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
          {errors.installments ? <p className="field__error">{errors.installments}</p> : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={rows.length >= 12}
            onClick={() =>
              setRows((list) => [
                ...list,
                { label: `Tranche ${list.length}`, amount: '', dueDate: addDays(list.at(-1)?.dueDate ?? today(), 60) },
              ])
            }
          >
            <Plus size={16} /> Ajouter une échéance
          </Button>
        </div>
        <p style={{ fontWeight: 700 }} className="num">
          Total annuel : {money(total)}
        </p>
        <Button type="submit" block loading={loading}>
          {cls ? 'Enregistrer' : 'Créer la classe'}
        </Button>
        {cls && cls.studentsCount === 0 ? (
          <Button type="button" variant="ghost" block onClick={remove}>
            <Trash2 size={16} /> Supprimer la classe
          </Button>
        ) : null}
      </form>
    </Sheet>
  );
}
