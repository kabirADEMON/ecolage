import { describe, expect, it } from 'vitest';
import { amountInWords, applyDiscount, summarizeFees, type PlanItem } from '../src/domain/fees.js';

const plan: PlanItem[] = [
  { id: 'i', label: 'Inscription', amount: 25_000, dueDate: '2026-09-30', position: 0 },
  { id: 't1', label: 'Tranche 1', amount: 60_000, dueDate: '2026-10-31', position: 1 },
  { id: 't2', label: 'Tranche 2', amount: 50_000, dueDate: '2027-01-31', position: 2 },
  { id: 't3', label: 'Tranche 3', amount: 40_000, dueDate: '2027-04-30', position: 3 },
];

describe('échéancier', () => {
  it('impute les paiements dans l’ordre des tranches', () => {
    const s = summarizeFees(plan, 0, 50_000, '2026-10-15');
    expect(s.schedule.map((l) => [l.label, l.paid, l.status])).toEqual([
      ['Inscription', 25_000, 'paid'],
      ['Tranche 1', 25_000, 'partial'],
      ['Tranche 2', 0, 'due'],
      ['Tranche 3', 0, 'due'],
    ]);
    expect(s).toMatchObject({ totalNet: 175_000, balance: 125_000, overdueAmount: 0, state: 'on_track' });
    expect(s.nextDue).toEqual({ label: 'Tranche 1', dueDate: '2026-10-31', remaining: 35_000 });
  });

  it('calcule le retard sur les tranches échues', () => {
    const s = summarizeFees(plan, 0, 50_000, '2026-11-05');
    expect(s.overdueAmount).toBe(35_000);
    expect(s.state).toBe('late');
    expect(s.schedule[1]!.status).toBe('overdue');
    expect(s.nextDue?.label).toBe('Tranche 2');
  });

  it('retire la réduction en partant de la dernière tranche', () => {
    const nets = applyDiscount(plan, 55_000).map((l) => l.net);
    expect(nets).toEqual([25_000, 60_000, 35_000, 0]);
    const s = summarizeFees(plan, 55_000, 0, '2026-09-01');
    expect(s).toMatchObject({ totalGross: 175_000, discount: 55_000, totalNet: 120_000 });
  });

  it('plafonne une réduction supérieure au total', () => {
    const s = summarizeFees(plan, 999_999, 0, '2026-09-01');
    expect(s).toMatchObject({ totalNet: 0, discount: 175_000, balance: 0, state: 'settled' });
  });

  it('signale une avance quand on a trop payé', () => {
    const s = summarizeFees(plan, 0, 180_000, '2026-09-01');
    expect(s.balance).toBe(-5_000);
    expect(s.state).toBe('settled');
    expect(s.schedule.every((l) => l.status === 'paid')).toBe(true);
  });

  it('ignore l’ordre de saisie des tranches', () => {
    const shuffled = [plan[2]!, plan[0]!, plan[3]!, plan[1]!];
    expect(summarizeFees(shuffled, 0, 25_000, '2026-09-01').schedule[0]!.label).toBe('Inscription');
  });
});

describe('montant en lettres', () => {
  it.each([
    [0, 'zéro'],
    [1, 'un'],
    [17, 'dix-sept'],
    [21, 'vingt-et-un'],
    [71, 'soixante-et-onze'],
    [80, 'quatre-vingts'],
    [81, 'quatre-vingt-un'],
    [99, 'quatre-vingt-dix-neuf'],
    [100, 'cent'],
    [200, 'deux-cents'],
    [250, 'deux-cent-cinquante'],
    [1_000, 'mille'],
    [2_000, 'deux-mille'],
    [80_000, 'quatre-vingt-mille'],
    [200_000, 'deux-cent-mille'],
    [25_500, 'vingt-cinq-mille-cinq-cents'],
    [175_000, 'cent-soixante-quinze-mille'],
    [1_000_000, 'un-million'],
    [2_350_000, 'deux-millions-trois-cent-cinquante-mille'],
  ])('%i -> %s', (n, words) => {
    expect(amountInWords(n)).toBe(words);
  });

  it('refuse un montant négatif ou décimal', () => {
    expect(() => amountInWords(-1)).toThrow();
    expect(() => amountInWords(1.5)).toThrow();
  });
});
