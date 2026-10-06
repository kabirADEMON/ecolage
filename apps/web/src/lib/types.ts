export type Role = 'director' | 'cashier';

export type User = {
  id: string;
  name: string;
  phone: string | null;
  phoneDisplay: string | null;
  role: Role;
  active: boolean;
};

export type School = {
  id: string;
  name: string;
  city: string;
  phone: string | null;
  yearLabel: string;
  isDemo: boolean;
};

export type Session = { user: User; school: School };

export type Installment = { id: string; label: string; amount: number; dueDate: string; position: number };

export type SchoolClass = {
  id: string;
  name: string;
  position: number;
  total: number;
  studentsCount: number;
  installments: Installment[];
};

export type FeeState = 'settled' | 'late' | 'on_track';
export type InstallmentStatus = 'paid' | 'partial' | 'due' | 'overdue';

export type FeeSummary = {
  totalGross: number;
  discount: number;
  totalNet: number;
  totalPaid: number;
  balance: number;
  overdueAmount: number;
  nextDue: { label: string; dueDate: string; remaining: number } | null;
  state: FeeState;
  schedule: (Installment & { net: number; paid: number; remaining: number; status: InstallmentStatus })[];
};

export type StudentRow = {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  classId: string;
  className: string;
  parentName: string;
  parentPhone: string | null;
  archived: boolean;
  totalNet: number;
  totalPaid: number;
  balance: number;
  overdueAmount: number;
  state: FeeState;
  nextDue: FeeSummary['nextDue'];
};

export type PaymentMethod = 'cash' | 'momo' | 'bank';

export type PaymentRow = {
  id: string;
  receiptNumber: number;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  createdAt: string;
  cashierName: string | null;
  online: boolean;
  cancelled: boolean;
  cancelReason: string | null;
  studentId: string;
  studentName: string;
  className: string;
};

export type StudentDetail = {
  student: {
    id: string;
    matricule: string;
    firstName: string;
    lastName: string;
    classId: string;
    className: string;
    parentName: string;
    parentPhone: string | null;
    discount: number;
    shareToken: string;
    archived: boolean;
  };
  summary: FeeSummary;
  payments: PaymentRow[];
};

export type Receipt = {
  id: string;
  receiptNumber: number;
  amount: number;
  amountInWords: string;
  method: PaymentMethod;
  reference: string | null;
  createdAt: string;
  cashierName: string | null;
  online: boolean;
  cancelled: { at: string; by: string | null; reason: string | null } | null;
  balanceAfter: number;
  school: { name: string; city: string; phone: string | null; yearLabel: string };
  student: { id: string; matricule: string; name: string; className: string; parentName: string };
};

export type Dashboard = {
  studentsCount: number;
  expected: number;
  collected: number;
  rate: number;
  overdueAmount: number;
  lateCount: number;
  settledCount: number;
  collectedToday: number;
  collectedThisMonth: number;
  perClass: {
    id: string;
    name: string;
    students: number;
    expected: number;
    collected: number;
    overdue: number;
    lateCount: number;
    rate: number;
  }[];
  topLate: StudentRow[];
  recent: PaymentRow[];
};

export type CashJournal = {
  day: string;
  payments: PaymentRow[];
  total: number;
  count: number;
  cancelledCount: number;
  byMethod: Record<PaymentMethod, number>;
  byCashier: { name: string; count: number; cash: number; total: number }[];
};

export type Portal = {
  school: { name: string; city: string; yearLabel: string; phone: string | null; phoneDisplay: string | null };
  student: { firstName: string; lastName: string; matricule: string; className: string };
  summary: FeeSummary;
  payments: { id: string; receiptNumber: number; amount: number; method: PaymentMethod; createdAt: string }[];
  payment: { provider: 'fedapay' | 'mock'; minAmount: number };
};

export type OnlineStatus = {
  id: string;
  status: 'pending' | 'approved' | 'declined' | 'canceled';
  amount: number;
  provider: 'fedapay' | 'mock';
  schoolName: string;
  studentName: string;
  shareToken: string;
  receiptId: string | null;
  balance: number;
};
