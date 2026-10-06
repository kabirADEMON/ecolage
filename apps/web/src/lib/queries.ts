import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router';
import { api } from './api';
import type { CashJournal, Dashboard, SchoolClass, Session, StudentDetail, StudentRow } from './types';

export const useAppSession = () => useOutletContext<Session>();
export const useIsDirector = () => useAppSession().user.role === 'director';

export const useDashboard = () =>
  useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard') });

export const useStudents = () =>
  useQuery({
    queryKey: ['students'],
    queryFn: async () => (await api.get<{ students: StudentRow[] }>('/students')).students,
  });

export const useStudent = (id: string) =>
  useQuery({ queryKey: ['student', id], queryFn: () => api.get<StudentDetail>(`/students/${id}`) });

export const useClasses = () =>
  useQuery({
    queryKey: ['classes'],
    queryFn: async () => (await api.get<{ classes: SchoolClass[] }>('/classes')).classes,
  });

export const useCash = (day: string) =>
  useQuery({ queryKey: ['cash', day], queryFn: () => api.get<CashJournal>(`/cash?date=${day}`) });

// Toute modification d'un élève renvoie sa fiche à jour : on la met en cache et on
// rafraîchit tout ce qui en dépend (listes, tableau de bord, caisse, classes).
export function useStudentMutation<V, R extends StudentDetail = StudentDetail>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (detail) => {
      qc.setQueryData(['student', detail.student.id], detail);
      for (const key of ['students', 'dashboard', 'cash', 'classes']) void qc.invalidateQueries({ queryKey: [key] });
    },
  });
}

export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    for (const key of ['students', 'student', 'dashboard', 'cash', 'classes', 'receipt']) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };
}
