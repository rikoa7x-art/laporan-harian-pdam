// Type definitions for PDAM Tirta Rangga Activity Report App
import rkapData from './rkap_new.json';

export type Division = 'perencanaan_teknik' | 'prodistan' | 'maintenance' | 'direksi';

export type SubDivision =
  | 'bangunan_sipil' | 'perpipaan' | 'wasdal'
  | 'trandist' | 'quality_control' | 'nrw'
  | 'mekanikal' | 'elektrikal' | 'bengkel_meter';

export type Status = 'rencana' | 'dalam_pekerjaan' | 'selesai' | 'ditunda';

export interface RKAPProgram {
  id: string;
  program: string;
  branch: string;
  target_bulanan: string[];
  pagu_anggaran: number;
}

export interface MonthlyPlan {
  id: string;
  rkap_id: string;
  program: string;
  divisi: Division;
  sub_divisi?: SubDivision;
  bulan: number; // 1-12
  tahun: number;
}

export interface WeeklyPlan {
  id: string;
  monthly_plan_id: string;
  program: string;
  divisi: Division;
  sub_divisi?: SubDivision;
  catatan?: string;
  bulan: number;
  tahun: number;
  tanggal_mulai: string; // YYYY-MM-DD
  penanggung_jawab: string[];
  foto_urls?: string[]; // Arrays of URLs, max 3 photos
  status: Status;
}

export const DIVISIONS: { id: Division; name: string; color: string }[] = [
  { id: 'perencanaan_teknik', name: 'Divisi Perencanaan Teknik', color: 'blue' },
  { id: 'prodistan', name: 'Divisi Produksi & Distribusi', color: 'green' },
  { id: 'maintenance', name: 'Divisi Maintenance', color: 'orange' },
  { id: 'direksi', name: 'Dashboard Direksi', color: 'purple' },
];

export const SUB_DIVISIONS: Record<Division, { id: SubDivision; name: string }[]> = {
  perencanaan_teknik: [
    { id: 'bangunan_sipil', name: 'Bangunan Sipil' },
    { id: 'perpipaan', name: 'Perpipaan' },
    { id: 'wasdal', name: 'Wasdal' },
  ],
  prodistan: [
    { id: 'trandist', name: 'Trandist' },
    { id: 'quality_control', name: 'Quality Control' },
    { id: 'nrw', name: 'NRW' },
  ],
  maintenance: [
    { id: 'mekanikal', name: 'Mekanikal' },
    { id: 'elektrikal', name: 'Elektrikal' },
    { id: 'bengkel_meter', name: 'Bengkel Meter' },
  ],
  direksi: [],
};

export const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const STATUS_OPTIONS: { value: Status; label: string; color: string }[] = [
  { value: 'rencana', label: 'Rencana', color: 'gray' },
  { value: 'dalam_pekerjaan', label: 'Dalam Pekerjaan', color: 'blue' },
  { value: 'selesai', label: 'Selesai', color: 'green' },
  { value: 'ditunda', label: 'Ditunda', color: 'red' },
];

export const EMPLOYEES: { id: string; name: string; division: Division; sub_division?: SubDivision; position: string; level: 'manager' | 'asman' | 'staf' }[] = [
  // Divisi Perencanaan Teknik
  { id: 'emp-pt-1', name: 'Dadi Riswadi', division: 'perencanaan_teknik', position: 'Manager', level: 'manager' },
  { id: 'emp-pt-2', name: 'M. Sulaeman', division: 'perencanaan_teknik', position: 'Asman', level: 'asman' },
  { id: 'emp-pt-3', name: 'Riko Komara', division: 'perencanaan_teknik', position: 'Asman', level: 'asman' },
  { id: 'emp-pt-4', name: 'Dian Suhendrik', division: 'perencanaan_teknik', position: 'Staf', level: 'staf' },
  { id: 'emp-pt-5', name: 'Yunia', division: 'perencanaan_teknik', position: 'Staf', level: 'staf' },
  { id: 'emp-pt-6', name: 'Andit', division: 'perencanaan_teknik', position: 'Staf', level: 'staf' },
  { id: 'emp-pt-7', name: 'Fahry', division: 'perencanaan_teknik', position: 'Staf', level: 'staf' },
  { id: 'emp-pt-8', name: 'Aldy', division: 'perencanaan_teknik', position: 'Staf', level: 'staf' },

  // Divisi Produksi & Distribusi
  { id: 'emp-pd-1', name: 'Johan Abdulah', division: 'prodistan', position: 'Manager', level: 'manager' },
  { id: 'emp-pd-2', name: 'Indra Wahidin', division: 'prodistan', position: 'Asman', level: 'asman' },
  { id: 'emp-pd-3', name: 'Wahmin', division: 'prodistan', position: 'Asman', level: 'asman' },
  { id: 'emp-pd-4', name: 'Agung Syah Ganjar', division: 'prodistan', position: 'Asman', level: 'asman' },
  { id: 'emp-pd-5', name: 'Salman', division: 'prodistan', position: 'Staf', level: 'staf' },
  { id: 'emp-pd-6', name: 'Rivaldy', division: 'prodistan', position: 'Staf', level: 'staf' },
  { id: 'emp-pd-7', name: 'Fika', division: 'prodistan', position: 'Staf', level: 'staf' },
  { id: 'emp-pd-8', name: 'Vany', division: 'prodistan', position: 'Staf', level: 'staf' },
  { id: 'emp-pd-9', name: 'Tarmedy', division: 'prodistan', position: 'Staf', level: 'staf' },
  { id: 'emp-pd-10', name: 'Kanang', division: 'prodistan', position: 'Staf', level: 'staf' },
  { id: 'emp-pd-11', name: 'Fahril', division: 'prodistan', position: 'Staf', level: 'staf' },
  { id: 'emp-pd-12', name: 'Tio', division: 'prodistan', position: 'Staf', level: 'staf' },

  // Divisi Maintenance
  { id: 'emp-mt-1', name: 'Sumarli', division: 'maintenance', position: 'Manager', level: 'manager' },
  { id: 'emp-mt-2', name: 'Dilong', division: 'maintenance', position: 'Asman', level: 'asman' },
  { id: 'emp-mt-3', name: 'Dewah', division: 'maintenance', position: 'Asman', level: 'asman' },
  { id: 'emp-mt-4', name: 'Fredy', division: 'maintenance', position: 'Asman', level: 'asman' },
  { id: 'emp-mt-5', name: 'Dede', division: 'maintenance', position: 'Staf', level: 'staf' },
  { id: 'emp-mt-6', name: 'Faqih', division: 'maintenance', position: 'Staf', level: 'staf' },
  { id: 'emp-mt-7', name: 'Ari', division: 'maintenance', position: 'Staf', level: 'staf' },
  { id: 'emp-mt-8', name: 'Diki', division: 'maintenance', position: 'Staf', level: 'staf' },
  { id: 'emp-mt-9', name: 'Dony', division: 'maintenance', position: 'Staf', level: 'staf' },
];

export const getEmployeesByDivision = (division: Division | 'all') => {
  if (division === 'all') return EMPLOYEES;
  return EMPLOYEES.filter(emp => emp.division === division);
};

export const DEFAULT_RKAP_PROGRAMS: RKAPProgram[] = rkapData.map((item: any) => ({
  id: item.id,
  program: item.nama_program || item.kode_program || 'Program Tanpa Nama',
  branch: item.branch || 'KANTOR PUSAT',
  target_bulanan: item.target_bulanan || [],
  pagu_anggaran: item.anggaran_tahunan || 0,
}));

export const BRANCHES = Array.from(new Set(DEFAULT_RKAP_PROGRAMS.map(p => p.branch))).sort();
