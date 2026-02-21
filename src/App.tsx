import { useState, useMemo, useEffect } from 'react';
import { DIVISIONS, MONTHS, STATUS_OPTIONS, DEFAULT_RKAP_PROGRAMS, BRANCHES, EMPLOYEES, getEmployeesByDivision, type Division, type MonthlyPlan, type WeeklyPlan, type Status } from './types';
import { cn } from './utils/cn';
import { Sun, Moon } from 'lucide-react';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const CURRENT_DIVISION_KEY = 'pdam_current_division';

const loadCurrentDivision = (): Division | null => {
  const stored = localStorage.getItem(CURRENT_DIVISION_KEY);
  return stored ? (stored as Division) : null;
};

const saveCurrentDivision = (division: Division | null) => {
  if (division) {
    localStorage.setItem(CURRENT_DIVISION_KEY, division);
  } else {
    localStorage.removeItem(CURRENT_DIVISION_KEY);
  }
};

const getWeekOfMonth = (dateString: string): number => {
  if (!dateString) return 1;
  const date = new Date(dateString);
  const dateNum = date.getDate();
  return Math.max(1, Math.min(5, Math.ceil(dateNum / 7)));
};

export function App() {
  const [currentDivision, setCurrentDivision] = useState<Division | null>(loadCurrentDivision);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rkap' | 'bulanan' | 'mingguan' | 'laporan' | 'pegawai'>('dashboard');
  const selectedDivision = currentDivision || 'all'; // Fallback logic
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [rkapCabang, setRkapCabang] = useState<string>('all');
  const [rkapBulan, setRkapBulan] = useState<number | 'all'>('all');

  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  // Apply theme to html element
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlan[]>([]);
  const [weeklyPlans, setWeeklyPlans] = useState<WeeklyPlan[]>([]);

  // Firebase Real-time Listeners
  useEffect(() => {
    const qMonthly = query(collection(db, 'monthlyPlans'));
    const unsubMonthly = onSnapshot(qMonthly, (snapshot) => {
      const plans: MonthlyPlan[] = [];
      snapshot.forEach(doc => {
        plans.push({ ...doc.data(), id: doc.id } as MonthlyPlan);
      });
      setMonthlyPlans(plans);
    });

    const qWeekly = query(collection(db, 'weeklyPlans'));
    const unsubWeekly = onSnapshot(qWeekly, (snapshot) => {
      const plans: WeeklyPlan[] = [];
      snapshot.forEach(doc => {
        plans.push({ ...doc.data(), id: doc.id } as WeeklyPlan);
      });
      setWeeklyPlans(plans);
    });

    return () => {
      unsubMonthly();
      unsubWeekly();
    };
  }, []);

  // Modal states
  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const [showWeeklyModal, setShowWeeklyModal] = useState(false);
  const [editingMonthly, setEditingMonthly] = useState<MonthlyPlan | null>(null);
  const [editingWeekly, setEditingWeekly] = useState<WeeklyPlan | null>(null);
  const [selectedMonthlyForWeekly, setSelectedMonthlyForWeekly] = useState<MonthlyPlan | null>(null);

  // Form states
  const [monthlyForm, setMonthlyForm] = useState({
    rkap_id: '',
    program: '',
    divisi: 'perencanaan_teknik' as Division,
    status: 'rencana' as Status,
  });

  const [weeklyForm, setWeeklyForm] = useState({
    monthly_plan_id: '',
    program: '',
    divisi: 'perencanaan_teknik' as Division,
    tanggal_mulai: '',
    penanggung_jawab: [] as string[],
  });

  // Login Password States
  const [selectedLoginDivision, setSelectedLoginDivision] = useState<Division | null>(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Filter plans
  const filteredMonthlyPlans = useMemo(() => {
    return monthlyPlans.filter(plan => {
      // If logged in as specific division, force filter to that division
      const effectiveDivision = currentDivision ? currentDivision : selectedDivision;
      const divisionMatch = effectiveDivision === 'direksi' || effectiveDivision === 'all' || plan.divisi === effectiveDivision;
      const monthMatch = plan.bulan === selectedMonth && plan.tahun === selectedYear;
      return divisionMatch && monthMatch;
    });
  }, [monthlyPlans, selectedDivision, selectedMonth, selectedYear, currentDivision]);

  const filteredWeeklyPlans = useMemo(() => {
    return weeklyPlans.filter(plan => {
      const effectiveDivision = currentDivision ? currentDivision : selectedDivision;
      const divisionMatch = effectiveDivision === 'direksi' || effectiveDivision === 'all' || plan.divisi === effectiveDivision;
      const monthMatch = plan.bulan === selectedMonth && plan.tahun === selectedYear;
      return divisionMatch && monthMatch;
    });
  }, [weeklyPlans, selectedDivision, selectedMonth, selectedYear, currentDivision]);

  // Statistics
  const stats = useMemo(() => {
    const monthlyFiltered = monthlyPlans.filter(p => p.bulan === selectedMonth && p.tahun === selectedYear);
    const weeklyFiltered = weeklyPlans.filter(p => p.bulan === selectedMonth && p.tahun === selectedYear);

    const relevantDivisions = currentDivision === 'direksi' || !currentDivision
      ? DIVISIONS.filter(d => d.id !== 'direksi') // Do not compute stats on direksi dummy grouping
      : DIVISIONS.filter(d => d.id === currentDivision);

    const divisionMonthlyFiltered = (currentDivision === 'direksi' || !currentDivision)
      ? monthlyFiltered
      : monthlyFiltered.filter(p => p.divisi === currentDivision);

    const divisionWeeklyFiltered = (currentDivision === 'direksi' || !currentDivision)
      ? weeklyFiltered
      : weeklyFiltered.filter(p => p.divisi === currentDivision);

    const byDivision = relevantDivisions.map(div => ({
      ...div,
      monthly: monthlyFiltered.filter(p => p.divisi === div.id).length,
      weekly: weeklyFiltered.filter(p => p.divisi === div.id).length,
      selesai: monthlyFiltered.filter(p => p.divisi === div.id && p.status === 'selesai').length,
    }));

    const statusCounts = STATUS_OPTIONS.map(s => ({
      ...s,
      count: divisionMonthlyFiltered.filter(p => p.status === s.value).length,
    }));

    return { byDivision, statusCounts, totalMonthly: divisionMonthlyFiltered.length, totalWeekly: divisionWeeklyFiltered.length };
  }, [monthlyPlans, weeklyPlans, selectedMonth, selectedYear, currentDivision]);

  // Handlers
  const handleDivisionSelect = (divisionId: Division) => {
    if (divisionId === 'direksi') {
      setCurrentDivision(divisionId);
      saveCurrentDivision(divisionId);
    } else {
      setSelectedLoginDivision(divisionId);
      setLoginPassword('');
      setLoginError('');
    }
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoginDivision) return;

    let isValid = false;
    const pwd = loginPassword.toLowerCase().trim();

    if (selectedLoginDivision === 'perencanaan_teknik' && pwd === 'dadi') isValid = true;
    if (selectedLoginDivision === 'prodistan' && pwd === 'johan') isValid = true;
    if (selectedLoginDivision === 'maintenance' && pwd === 'sumarli') isValid = true;

    if (isValid) {
      setCurrentDivision(selectedLoginDivision);
      saveCurrentDivision(selectedLoginDivision);
      setSelectedLoginDivision(null);
    } else {
      setLoginError('Password salah. Silakan coba lagi.');
    }
  };
  const handleSaveMonthly = async () => {
    const planData: Omit<MonthlyPlan, 'id'> = {
      rkap_id: monthlyForm.rkap_id,
      program: monthlyForm.program,
      divisi: currentDivision && currentDivision !== 'direksi' ? currentDivision : 'perencanaan_teknik',
      bulan: selectedMonth,
      tahun: selectedYear,
      status: monthlyForm.status,
    };

    try {
      if (editingMonthly) {
        // Update existing document
        const docRef = doc(db, 'monthlyPlans', editingMonthly.id);
        await updateDoc(docRef, planData);
      } else {
        // Add new document
        await addDoc(collection(db, 'monthlyPlans'), planData);
      }

      setShowMonthlyModal(false);
      setEditingMonthly(null);
      resetMonthlyForm();
    } catch (error) {
      console.error("Error saving monthly plan: ", error);
      alert("Gagal menyimpan data plan bulanan.");
    }
  };

  const handleEditMonthly = (plan: MonthlyPlan) => {
    setMonthlyForm({
      rkap_id: plan.rkap_id,
      program: plan.program,
      divisi: plan.divisi,
      status: plan.status,
    });
    setEditingMonthly(plan);
    setShowMonthlyModal(true);
  };

  const handleDeleteMonthly = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'monthlyPlans', id));
      // Also delete related weekly plans
      const relatedWeekly = weeklyPlans.filter(w => w.monthly_plan_id === id);
      for (const weekly of relatedWeekly) {
        await deleteDoc(doc(db, 'weeklyPlans', weekly.id));
      }
    } catch (error) {
      console.error("Error deleting monthly plan: ", error);
      alert("Gagal menghapus data plan bulanan.");
    }
  };

  const resetMonthlyForm = () => {
    setMonthlyForm({
      rkap_id: '',
      program: '',
      divisi: 'perencanaan_teknik',
      status: 'rencana',
    });
  };

  const handleAddFromRKAP = async (prog: typeof DEFAULT_RKAP_PROGRAMS[0]) => {
    const planData: Omit<MonthlyPlan, 'id'> = {
      rkap_id: prog.id,
      program: prog.program,
      divisi: currentDivision && currentDivision !== 'direksi' ? currentDivision : 'perencanaan_teknik',
      bulan: selectedMonth,
      tahun: selectedYear,
      status: 'rencana',
    };

    try {
      await addDoc(collection(db, 'monthlyPlans'), planData);
    } catch (error) {
      console.error("Error adding from RKAP: ", error);
      alert("Gagal menambahkan program ke Rencana Bulanan.");
    }
  };

  const handleSaveWeekly = async () => {
    const planData: Omit<WeeklyPlan, 'id'> = {
      monthly_plan_id: weeklyForm.monthly_plan_id,
      program: weeklyForm.program,
      divisi: currentDivision && currentDivision !== 'direksi' ? currentDivision : 'perencanaan_teknik',
      bulan: selectedMonth,
      tahun: selectedYear,
      tanggal_mulai: weeklyForm.tanggal_mulai,
      penanggung_jawab: weeklyForm.penanggung_jawab,
    };

    try {
      if (editingWeekly) {
        // Update existing
        const docRef = doc(db, 'weeklyPlans', editingWeekly.id);
        await updateDoc(docRef, planData);
      } else {
        // Add new
        await addDoc(collection(db, 'weeklyPlans'), planData);
      }

      setShowWeeklyModal(false);
      setEditingWeekly(null);
      resetWeeklyForm();
    } catch (error) {
      console.error("Error saving weekly plan: ", error);
      alert("Gagal menyimpan data plan mingguan.");
    }
  };

  const handleEditWeekly = (plan: WeeklyPlan) => {
    setWeeklyForm({
      monthly_plan_id: plan.monthly_plan_id,
      program: plan.program,
      divisi: plan.divisi,
      tanggal_mulai: plan.tanggal_mulai,
      penanggung_jawab: [...plan.penanggung_jawab],
    });
    setEditingWeekly(plan);
    setShowWeeklyModal(true);
  };

  const handleDeleteWeekly = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'weeklyPlans', id));
    } catch (error) {
      console.error("Error deleting weekly plan: ", error);
      alert("Gagal menghapus data plan mingguan.");
    }
  };

  const resetWeeklyForm = () => {
    setWeeklyForm({
      monthly_plan_id: '',
      program: '',
      divisi: 'perencanaan_teknik',
      tanggal_mulai: '',
      penanggung_jawab: [],
    });
  };

  const openWeeklyModalForMonthly = (monthly: MonthlyPlan) => {
    setSelectedMonthlyForWeekly(monthly);
    setWeeklyForm({
      monthly_plan_id: monthly.id,
      program: monthly.program,
      divisi: monthly.divisi,
      tanggal_mulai: '',
      penanggung_jawab: [],
    });
    setEditingWeekly(null);
    setShowWeeklyModal(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
  };

  const handleLogin = (div: Division) => {
    setCurrentDivision(div);
    saveCurrentDivision(div);
  };

  const handleLogout = () => {
    setCurrentDivision(null);
    saveCurrentDivision(null);
  };

  if (!currentDivision) {
    return (
      <div className="min-h-screen bg-[conic-gradient(at_top_right,_var(--tw-gradient-stops))] from-blue-900 via-slate-800 to-indigo-900 dark:from-slate-950 dark:via-black dark:to-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden transition-colors duration-500">
        {/* Animated Background Orbs */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-50 dark:opacity-30 dark:mix-blend-screen animate-blob"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-50 dark:opacity-30 dark:mix-blend-screen animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-50 dark:opacity-30 dark:mix-blend-screen animate-blob animation-delay-4000"></div>

        <div className="w-full max-w-md glass-panel rounded-3xl overflow-hidden z-10 relative">
          <div className="p-8 text-center bg-gradient-to-b from-white/20 to-transparent border-b border-white/10 dark:from-white/5 dark:border-white/5">
            <div className="h-20 w-20 glass-button rounded-2xl flex items-center justify-center mx-auto mb-6 transform hover:scale-105 transition-transform duration-300 overflow-hidden bg-white/50 dark:bg-black/20">
              <img src="/assets/logo.jpg" alt="Logo PDAM" className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal p-2" />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-800 dark:text-white mb-2 tracking-tight drop-shadow-sm">PDAM Tirta Rangga</h1>
            <p className="text-slate-600 dark:text-slate-300 text-sm font-bold tracking-wide uppercase">Sistem Laporan & RKAP</p>
          </div>
          <div className="p-8 bg-black/5 dark:bg-black/20 backdrop-blur-md">
            <h2 className="text-sm font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-6 text-center">Akses Divisi</h2>

            {!selectedLoginDivision ? (
              <div className="space-y-4">
                {DIVISIONS.map(div => (
                  <button
                    key={div.id}
                    onClick={() => handleDivisionSelect(div.id)}
                    className={cn(
                      "w-full text-left px-6 py-4 rounded-2xl font-semibold transition-all duration-300 group flex items-center justify-between border shadow-lg hover:shadow-xl hover:-translate-y-1 overflow-hidden relative",
                      div.color === 'blue' ? 'border-blue-400 bg-blue-500/20 text-white hover:bg-blue-500/30 dark:border-blue-500/50' :
                        div.color === 'green' ? 'border-emerald-400 bg-emerald-500/20 text-white hover:bg-emerald-500/30 dark:border-emerald-500/50' :
                          div.color === 'purple' ? 'border-purple-400 bg-purple-500/20 text-white hover:bg-purple-500/30 dark:border-purple-500/50' :
                            'border-amber-400 bg-amber-500/20 text-white hover:bg-amber-500/30 dark:border-amber-500/50'
                    )}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                    <span className="relative z-10 flex items-center gap-3">
                      <span className={cn("w-2 h-2 rounded-full shadow-sm",
                        div.color === 'blue' ? 'bg-blue-400 shadow-blue-400' :
                          div.color === 'green' ? 'bg-emerald-400 shadow-emerald-400' :
                            div.color === 'purple' ? 'bg-purple-400 shadow-purple-400' :
                              'bg-amber-400 shadow-amber-400'
                      )}></span>
                      {div.name}
                    </span>
                    <div className={cn("h-8 w-8 rounded-full flex items-center justify-center relative z-10 transition-transform duration-300 transform group-hover:translate-x-1 group-hover:bg-white/20",
                      div.color === 'blue' ? 'text-blue-200' :
                        div.color === 'green' ? 'text-emerald-200' :
                          div.color === 'purple' ? 'text-purple-200' :
                            'text-amber-200'
                    )}>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <form onSubmit={handleLoginSubmit} className="space-y-5 animate-fade-in-up">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center gap-2 mb-2">
                    <span className={cn("w-2 h-2 rounded-full",
                      DIVISIONS.find(d => d.id === selectedLoginDivision)?.color === 'blue' ? 'bg-blue-400' :
                        DIVISIONS.find(d => d.id === selectedLoginDivision)?.color === 'green' ? 'bg-emerald-400' : 'bg-amber-400'
                    )}></span>
                    <span className="text-white font-bold">{DIVISIONS.find(d => d.id === selectedLoginDivision)?.name}</span>
                  </div>
                  <p className="text-sm text-slate-400">Masukkan nama manager sebagai kata sandi.</p>
                </div>

                <div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <input
                      type="password"
                      autoFocus
                      value={loginPassword}
                      onChange={(e) => { setLoginPassword(e.target.value); setLoginError(''); }}
                      className="w-full bg-slate-900/50 dark:bg-black/40 border border-slate-600/50 dark:border-white/10 rounded-2xl py-4 pl-11 pr-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all backdrop-blur-sm"
                      placeholder="Password"
                    />
                  </div>
                  {loginError && (
                    <p className="mt-2 text-sm text-red-400 flex items-center gap-1.5 font-medium animate-fade-in-up">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {loginError}
                    </p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setSelectedLoginDivision(null); setLoginError(''); setLoginPassword(''); }}
                    className="flex-1 py-3 px-4 rounded-xl font-bold bg-white/10 hover:bg-white/20 text-white transition-all duration-300 border border-white/10"
                  >
                    Kembali
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 px-4 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all duration-300 shadow-lg shadow-blue-900/50 border border-blue-500/50"
                  >
                    Masuk
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent" style={{ backgroundColor: theme === 'dark' ? '#020617' : '#f8fafc' }}>
      {/* DEBUG: Theme indicator - remove after testing */}
      <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 9999, background: theme === 'dark' ? '#1e293b' : '#e2e8f0', color: theme === 'dark' ? '#94a3b8' : '#475569', padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid #94a3b8' }}>
        Theme: {theme} | dark class: {typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'YES' : 'NO'}
      </div>
      {/* Header */}
      <header className="sticky top-0 z-30 glass border-b-0 border-white/50 dark:border-white/10 backdrop-blur-xl text-slate-800 dark:text-slate-100 shadow-md m-4 rounded-3xl">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-white dark:bg-black border border-slate-200 dark:border-white/10 shadow-sm flex-shrink-0 flex items-center justify-center overflow-hidden transform group-hover:scale-105 transition-all duration-300">
                <img src="/assets/logo.jpg" alt="Logo" className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal p-1.5" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight drop-shadow-sm text-slate-800 dark:text-slate-100">PDAM Tirta Rangga</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-bold">Divisi <span className="text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded-md ml-1 inline-block">{DIVISIONS.find(d => d.id === currentDivision)?.name}</span></p>
              </div>
            </div>
            <div className="text-right flex items-center gap-6">
              <div className="hidden md:block">
                <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-0.5">Periode Berjalan</p>
                <p className="font-bold text-lg drop-shadow-sm bg-slate-100/80 dark:bg-slate-800/80 px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">{MONTHS[selectedMonth - 1]} {selectedYear}</p>
              </div>

              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="p-2.5 rounded-xl bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 shadow-sm border border-slate-200 dark:border-slate-700 transition-all hover:scale-105 active:scale-95"
                title={theme === 'light' ? 'Mode Gelap' : 'Mode Terang'}
              >
                {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </button>

              <button
                onClick={handleLogout}
                className="glass-button text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:-translate-y-0.5 hover:bg-white dark:hover:bg-slate-700"
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:inline">Ganti Divisi</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="max-w-7xl mx-auto px-6 mb-2">
        <div className="glass-card rounded-2xl p-3 flex flex-wrap items-center gap-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Bulan:</label>
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl pl-4 pr-10 py-2 text-sm focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none shadow-sm cursor-pointer"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 dark:text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Tahun:</label>
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl pl-4 pr-10 py-2 text-sm focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none shadow-sm cursor-pointer"
              >
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 dark:text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-6 py-2 mb-6">
        <div className="flex flex-wrap items-center gap-2 glass-card p-1.5 rounded-2xl w-fit drop-shadow-sm">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
            { id: 'rkap', label: 'Program RKAP', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
            { id: 'bulanan', label: 'Rencana Bulanan', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
            { id: 'mingguan', label: 'Rencana Mingguan', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
            { id: 'laporan', label: 'Laporan Direksi', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
            { id: 'pegawai', label: 'Daftar Pegawai', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 relative overflow-hidden group outline-none",
                activeTab === tab.id
                  ? "text-blue-700 dark:text-blue-400 bg-white dark:bg-slate-800 shadow-md ring-1 ring-blue-100 dark:ring-slate-700"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/40 dark:hover:bg-slate-800/40"
              )}
            >
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-blue-500 dark:bg-blue-400 rounded-t-full"></span>
              )}
              <svg className={cn("w-5 h-5", activeTab === tab.id ? "text-blue-600 dark:text-blue-400" : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === tab.id ? 2.5 : 2} d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 pb-24">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fade-in-up">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { title: 'Program Bulanan', value: stats.totalMonthly, borderTop: 'border-blue-500', bgAccent: 'bg-blue-500/10', gradient: 'from-blue-600 to-indigo-600', bgIcon: 'bg-gradient-to-br from-blue-100 to-blue-200', textIcon: 'text-blue-600', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                { title: 'Program Mingguan', value: stats.totalWeekly, borderTop: 'border-emerald-500', bgAccent: 'bg-emerald-500/10', gradient: 'from-emerald-600 to-teal-600', bgIcon: 'bg-gradient-to-br from-emerald-100 to-emerald-200', textIcon: 'text-emerald-600', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                { title: 'Selesai', value: stats.statusCounts.find(s => s.value === 'selesai')?.count || 0, borderTop: 'border-green-500', bgAccent: 'bg-green-500/10', gradient: 'from-green-500 to-emerald-600', bgIcon: 'bg-gradient-to-br from-green-100 to-green-200', textIcon: 'text-green-600', icon: 'M5 13l4 4L19 7' },
                { title: 'Dalam Pekerjaan', value: stats.statusCounts.find(s => s.value === 'dalam_pekerjaan')?.count || 0, borderTop: 'border-amber-500', bgAccent: 'bg-amber-500/10', gradient: 'from-amber-500 to-orange-500', bgIcon: 'bg-gradient-to-br from-amber-100 to-amber-200', textIcon: 'text-amber-600', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
              ].map((stat, idx) => (
                <div key={idx} className={`glass-card rounded-3xl p-6 relative overflow-hidden group border-t-4 ${stat.borderTop}`}>
                  <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full ${stat.bgAccent} blur-2xl group-hover:scale-150 transition-transform duration-700`}></div>
                  <div className="flex justify-between items-start relative z-10">
                    <div>
                      <p className="text-slate-500 text-sm font-semibold uppercase tracking-wider mb-2">{stat.title}</p>
                      <p className={`text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-br ${stat.gradient} drop-shadow-sm`}>
                        {stat.value}
                      </p>
                    </div>
                    <div className={`h-14 w-14 ${stat.bgIcon} rounded-2xl flex items-center justify-center shadow-inner transform group-hover:rotate-6 group-hover:scale-110 transition-transform duration-300`}>
                      <svg className={`w-7 h-7 ${stat.textIcon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={stat.icon} />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Division Stats */}
              <div className="lg:col-span-2 glass-card rounded-3xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-3xl -z-10"></div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Statistik per Divisi</h3>
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full border border-blue-100 dark:border-blue-800">Kinerja Aktif</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {stats.byDivision.map(div => (
                    <div key={div.id} className={cn("p-5 rounded-2xl border transition-all duration-300 hover:shadow-md relative overflow-hidden group",
                      div.color === 'blue' ? 'border-blue-100 dark:border-blue-900/50 bg-gradient-to-br from-blue-50/50 to-white dark:from-slate-800 dark:to-slate-800/80' :
                        div.color === 'green' ? 'border-emerald-100 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50/50 to-white dark:from-slate-800 dark:to-slate-800/80' :
                          div.color === 'purple' ? 'border-purple-100 dark:border-purple-900/50 bg-gradient-to-br from-purple-50/50 to-white dark:from-slate-800 dark:to-slate-800/80' :
                            'border-amber-100 dark:border-amber-900/50 bg-gradient-to-br from-amber-50/50 to-white dark:from-slate-800 dark:to-slate-800/80'
                    )}>
                      <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300",
                        div.color === 'blue' ? 'bg-blue-500' :
                          div.color === 'green' ? 'bg-emerald-500' :
                            div.color === 'purple' ? 'bg-purple-500' :
                              'bg-amber-500'
                      )}></div>
                      <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-4">{div.name}</h4>
                      <div className="grid grid-cols-3 gap-4 text-center divide-x divide-slate-100 dark:divide-slate-700">
                        <div>
                          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Bulanan</p>
                          <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{div.monthly}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Mingguan</p>
                          <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{div.weekly}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Selesai</p>
                          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{div.selesai}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Activities */}
              <div className="glass-card rounded-3xl p-6 flex flex-col h-full">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Program Terbaru</h3>
                  <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-400 dark:text-slate-500">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                </div>
                <div className="space-y-4 flex-1">
                  {filteredMonthlyPlans.slice(0, 5).map(plan => {
                    const div = DIVISIONS.find(d => d.id === plan.divisi);
                    return (
                      <div key={plan.id} className="group flex items-start p-3 bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/50 hover:border-blue-200 dark:hover:border-blue-500/50 rounded-2xl transition-all duration-300 hover:shadow-sm">
                        <div className={cn("mt-1 mr-3 h-3 w-3 rounded-full flex-shrink-0 shadow-sm",
                          plan.status === 'selesai' ? 'bg-green-500 shadow-green-500/50' :
                            plan.status === 'dalam_pekerjaan' ? 'bg-blue-500 shadow-blue-500/50' :
                              plan.status === 'ditunda' ? 'bg-red-500 shadow-red-500/50' : 'bg-slate-400 shadow-slate-400/50'
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm truncate group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">{plan.program}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{div?.name}</p>
                        </div>
                      </div>
                    );
                  })}
                  {filteredMonthlyPlans.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 space-y-3 py-8">
                      <svg className="w-12 h-12 stroke-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                      <p className="text-sm font-medium">Belum ada program bulan ini</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RKAP Tab */}
        {activeTab === 'rkap' && (
          <div className="space-y-6 animate-fade-in-up">
            {/* RKAP Filters */}
            <div className="glass-card rounded-3xl p-5 flex gap-6 items-center flex-wrap">
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cabang:</label>
                <div className="relative">
                  <select
                    value={rkapCabang}
                    onChange={(e) => setRkapCabang(e.target.value)}
                    className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl pl-4 pr-10 py-2 text-sm focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none shadow-sm cursor-pointer"
                  >
                    <option value="all">Semua Cabang</option>
                    {BRANCHES.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 dark:text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Bulan:</label>
                <div className="relative">
                  <select
                    value={rkapBulan}
                    onChange={(e) => setRkapBulan(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl pl-4 pr-10 py-2 text-sm focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none shadow-sm cursor-pointer"
                  >
                    <option value="all">Semua Bulan (Tahunan)</option>
                    {MONTHS.map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-3xl overflow-hidden relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-3xl -z-10"></div>
              <div className="p-6 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Program RKAP <span className="text-sm font-medium text-slate-400 dark:text-slate-500 font-normal block mt-1">(Rencana Kerja dan Anggaran Perusahaan)</span></h2>
                </div>
                <div className="p-2 bg-blue-50 dark:bg-slate-800 rounded-xl">
                  <svg className="w-6 h-6 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50/50 dark:bg-slate-800/50 backdrop-blur-sm border-b border-slate-100 dark:border-slate-700/50">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-16">No</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Program Kerja</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-48">Pagu</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700/50">
                    {DEFAULT_RKAP_PROGRAMS.filter(prog => {
                      // Filter by branch
                      if (rkapCabang !== 'all' && prog.branch !== rkapCabang) return false;

                      // Filter by month
                      if (rkapBulan !== 'all') {
                        const monthIndex = rkapBulan - 1;
                        const monthTarget = prog.target_bulanan[monthIndex];
                        // exclude programs with no budget for the selected month
                        if (!monthTarget || monthTarget === 'Rp\u00A00' || monthTarget === 'Rp 0') return false;
                      }

                      return true;
                    }).map((prog, i) => {
                      const displayPagu = rkapBulan === 'all'
                        ? formatCurrency(prog.pagu_anggaran)
                        : (prog.target_bulanan[rkapBulan - 1] || 'Rp 0');

                      const isAlreadyAdded = filteredMonthlyPlans.some(plan => plan.rkap_id === prog.id);

                      return (
                        <tr key={prog.id} className={cn(
                          "transition-colors duration-200 border-b border-slate-50 dark:border-slate-800 last:border-0 group",
                          isAlreadyAdded ? "bg-emerald-50/30 hover:bg-emerald-50/60 dark:bg-emerald-900/10 dark:hover:bg-emerald-900/20" : "hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                        )}>
                          <td className="px-6 py-5 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400 font-medium">
                            {isAlreadyAdded ? (
                              <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-green-500 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                {i + 1}
                              </div>
                            ) : (
                              i + 1
                            )}
                          </td>
                          <td className="px-6 py-5 text-sm text-slate-800 dark:text-slate-200 font-semibold group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">{prog.program}</td>
                          <td className="px-6 py-5 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300 font-mono tracking-tight font-medium bg-slate-50/50 dark:bg-slate-800/30">{displayPagu}</td>
                          <td className="px-6 py-5 whitespace-nowrap text-sm">
                            {isAlreadyAdded ? (
                              <button
                                disabled
                                className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 bg-emerald-100/50 dark:bg-emerald-900/30 px-4 py-2 rounded-xl border border-emerald-200/50 dark:border-emerald-800/50 opacity-80 cursor-not-allowed w-full justify-center"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="font-bold text-xs uppercase tracking-wide">Terpilih</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleAddFromRKAP(prog)}
                                className="flex items-center gap-2 text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 shadow-md hover:shadow-lg hover:-translate-y-0.5 px-4 py-2 rounded-xl transition-all duration-300 w-full justify-center group-hover:ring-2 ring-blue-500/20 dark:ring-blue-400/20"
                              >
                                <svg className="w-4 h-4 transform group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                </svg>
                                <span className="font-bold text-xs uppercase tracking-wide">Tambah</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Monthly Plan Tab */}
        {activeTab === 'bulanan' && (
          <div className="space-y-6 animate-fade-in-up">
            <div className="flex justify-between items-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-md p-4 rounded-3xl border border-white/60 dark:border-slate-700/50 shadow-sm">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 ml-2">Rencana Kerja Bulanan</h2>
              <button
                onClick={() => { resetMonthlyForm(); setEditingMonthly(null); setShowMonthlyModal(true); }}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ring-4 ring-blue-500/10 dark:ring-blue-400/10"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Tambah Manual
              </button>
            </div>

            <div className="glass-card rounded-3xl overflow-hidden relative">
              <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-3xl -z-10"></div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50/50 dark:bg-slate-800/50 backdrop-blur-sm border-b border-slate-100 dark:border-slate-700/50">
                    <tr>
                      <th className="px-6 py-5 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-16">No</th>
                      <th className="px-6 py-5 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Program</th>
                      <th className="px-6 py-5 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Divisi</th>
                      <th className="px-6 py-5 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                      {currentDivision !== 'direksi' && (
                        <th className="px-6 py-5 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-40">Aksi</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {filteredMonthlyPlans.map((plan, i) => {
                      const div = DIVISIONS.find(d => d.id === plan.divisi);
                      return (
                        <tr key={plan.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors duration-200 group">
                          <td className="px-6 py-4 text-sm font-medium text-slate-500 dark:text-slate-400">{i + 1}</td>
                          <td className="px-6 py-4 text-sm font-semibold text-slate-800 dark:text-slate-200 max-w-[200px] truncate group-hover:text-blue-700 dark:group-hover:text-blue-400">{plan.program}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={cn("px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide",
                              div?.color === 'blue' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                                div?.color === 'green' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            )}>
                              {div?.name.split(' ')[1]}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={cn("px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 w-fit",
                              plan.status === 'selesai' ? 'bg-green-100/50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50' :
                                plan.status === 'dalam_pekerjaan' ? 'bg-blue-100/50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50' :
                                  plan.status === 'ditunda' ? 'bg-red-100/50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50' : 'bg-slate-100/50 text-slate-700 border border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700'
                            )}>
                              <span className={cn("w-1.5 h-1.5 rounded-full inline-block",
                                plan.status === 'selesai' ? 'bg-green-500' :
                                  plan.status === 'dalam_pekerjaan' ? 'bg-blue-500' :
                                    plan.status === 'ditunda' ? 'bg-red-500' : 'bg-slate-500'
                              )}></span>
                              {STATUS_OPTIONS.find(s => s.value === plan.status)?.label}
                            </span>
                          </td>
                          {currentDivision !== 'direksi' && (
                            <td className="px-6 py-4">
                              <div className="flex gap-2 isolate">
                                <button onClick={() => openWeeklyModalForMonthly(plan)} className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-400/10 dark:hover:bg-emerald-400/20 rounded-xl transition-colors relative group/btn" title="Tambah Mingguan">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                  </svg>
                                  <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">Tambah Mingguan</span>
                                </button>
                                <button onClick={() => handleEditMonthly(plan)} className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-400/10 dark:hover:bg-blue-400/20 rounded-xl transition-colors relative group/btn" title="Edit">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 pointer-events-none transition-opacity">Edit</span>
                                </button>
                                <button onClick={() => handleDeleteMonthly(plan.id)} className="p-2 text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-400/10 dark:hover:bg-red-400/20 rounded-xl transition-colors relative group/btn" title="Hapus">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 pointer-events-none transition-opacity">Hapus</span>
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredMonthlyPlans.length === 0 && (
                  <div className="text-center py-16 text-slate-400 dark:text-slate-500">
                    <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-700 shadow-inner">
                      <svg className="w-10 h-10 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="font-medium">Belum ada rencana kerja bulanan</p>
                    <p className="text-sm mt-1">Klik "Tambah Manual" atau ambil dari Program RKAP</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Weekly Plan Tab */}
        {activeTab === 'mingguan' && (
          <div className="space-y-6 animate-fade-in-up">
            <div className="flex justify-between items-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-md p-4 rounded-3xl border border-white/60 dark:border-slate-700/50 shadow-sm">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 ml-2">Rencana Kerja Mingguan</h2>
            </div>

            <div className="space-y-8">
              {filteredWeeklyPlans.length > 0 ? (
                [1, 2, 3, 4, 5].map(weekNum => {
                  const weekPlans = filteredWeeklyPlans.filter(p => getWeekOfMonth(p.tanggal_mulai) === weekNum);
                  if (weekPlans.length === 0) return null;

                  return (
                    <div key={weekNum} className="relative">
                      {/* Timeline Header */}
                      <div className="flex items-center gap-4 mb-6 sticky top-[88px] z-10 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-md py-3 shadow-sm rounded-2xl px-4 border border-slate-200/50 dark:border-slate-800/50 mx-2">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-md flex items-center justify-center text-white font-bold shrink-0">
                          {weekNum}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Minggu Ke-{weekNum}</h3>
                          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{weekPlans.length} Program Dijadwalkan</p>
                        </div>
                      </div>

                      {/* Cards Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-4 md:pl-8 border-l-2 border-dashed border-emerald-200 dark:border-emerald-800/50 ml-6 md:ml-10">
                        {weekPlans.map(plan => {
                          const div = DIVISIONS.find(d => d.id === plan.divisi);
                          return (
                            <div key={plan.id} className="glass-card rounded-2xl p-5 relative group hover:-translate-y-1 transition-transform duration-300 flex flex-col h-full">
                              {/* Indicator Dot */}
                              <div className="absolute -left-[27px] md:-left-[43px] top-6 w-4 h-4 rounded-full bg-emerald-400 ring-4 ring-slate-50 dark:ring-slate-950 shadow-sm" />

                              <div className="flex justify-between items-start mb-4 gap-4">
                                <h4 className="text-base font-bold text-slate-800 dark:text-slate-100 leading-snug flex-1">{plan.program}</h4>
                                <span className={cn("px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0",
                                  div?.color === 'blue' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                                    div?.color === 'green' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                )}>
                                  {div?.name.split(' ')[1]}
                                </span>
                              </div>

                              <div className="space-y-3 flex-1">
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 w-fit px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-700/50">
                                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                  <span className="font-semibold">{plan.tanggal_mulai}</span>
                                </div>

                                <div>
                                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 mt-4">Penanggung Jawab</p>
                                  <div className="flex flex-wrap gap-2">
                                    {plan.penanggung_jawab.map((pj, idx) => (
                                      <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm">
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500"></div>
                                        {pj}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {currentDivision !== 'direksi' && (
                                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700/50 flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
                                  <button onClick={() => handleEditWeekly(plan)} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 rounded-lg transition-colors leading-none">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Edit
                                  </button>
                                  <button onClick={() => handleDeleteWeekly(plan.id)} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/40 rounded-lg transition-colors leading-none">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Hapus
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              ) : null}
            </div>

            {filteredWeeklyPlans.length === 0 && (
              <div className="text-center py-16 text-slate-400 dark:text-slate-500">
                <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-700 shadow-inner">
                  <svg className="w-10 h-10 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="font-medium text-slate-500 dark:text-slate-400">Belum ada rencana kerja mingguan</p>
                <p className="text-sm mt-1">Buka tab Bulanan, lalu klik ikon Tambah Mingguan pada program terkait</p>
              </div>
            )}
          </div>
        )}

        {/* Pegawai Tab */}
        {activeTab === 'pegawai' && (
          <div className="space-y-6 animate-fade-in-up">
            <div className="glass-card rounded-3xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-3xl -z-10"></div>
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Daftar Pegawai</h2>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-medium">PDAM Tirta Rangga Kabupaten Subang</p>
                </div>
                <div className="flex gap-2">
                  <div className="px-5 py-2.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-100/50 dark:border-blue-800/50 shadow-sm rounded-xl">
                    <span className="text-sm text-blue-700 dark:text-blue-400 font-bold uppercase tracking-wide">Total: {EMPLOYEES.length} Pegawai</span>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="glass-card p-5 relative overflow-hidden group border-t-4 border-t-purple-500 rounded-2xl">
                  <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-purple-500/10 blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-wider mb-1 mt-1">Manager</p>
                  <p className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-br from-purple-600 to-fuchsia-600 drop-shadow-sm">{EMPLOYEES.filter(e => e.level === 'manager').length}</p>
                </div>
                <div className="glass-card p-5 relative overflow-hidden group border-t-4 border-t-blue-500 rounded-2xl">
                  <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-blue-500/10 blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-wider mb-1 mt-1">Asman</p>
                  <p className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-br from-blue-600 to-indigo-600 drop-shadow-sm">{EMPLOYEES.filter(e => e.level === 'asman').length}</p>
                </div>
                <div className="glass-card p-5 relative overflow-hidden group border-t-4 border-t-emerald-500 rounded-2xl">
                  <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-emerald-500/10 blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-wider mb-1 mt-1">Staf</p>
                  <p className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-br from-emerald-600 to-teal-600 drop-shadow-sm">{EMPLOYEES.filter(e => e.level === 'staf').length}</p>
                </div>
                <div className="glass-card p-5 relative overflow-hidden group border-t-4 border-t-amber-500 rounded-2xl">
                  <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-amber-500/10 blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-wider mb-1 mt-1">Total Pegawai</p>
                  <p className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-br from-amber-500 to-orange-500 drop-shadow-sm">{EMPLOYEES.length}</p>
                </div>
              </div>

              {/* Employees by Division */}
              <div className="space-y-6">
                {(currentDivision === 'direksi'
                  ? DIVISIONS.filter(d => d.id !== 'direksi')
                  : DIVISIONS.filter(d => d.id === currentDivision)
                ).map(div => {
                  const divEmployees = EMPLOYEES.filter(e => e.division === div.id);
                  const managers = divEmployees.filter(e => e.level === 'manager');
                  const asmans = divEmployees.filter(e => e.level === 'asman');
                  const stafs = divEmployees.filter(e => e.level === 'staf');

                  return (
                    <div key={div.id} className={cn("rounded-2xl border bg-slate-50/30 dark:bg-slate-800/30 overflow-hidden shadow-sm hover:shadow-md transition-shadow",
                      div.color === 'blue' ? 'border-blue-200/60 dark:border-blue-800/60' :
                        div.color === 'green' ? 'border-emerald-200/60 dark:border-emerald-800/60' : 'border-amber-200/60 dark:border-amber-800/60'
                    )}>
                      <div className={cn("px-6 py-4 border-b",
                        div.color === 'blue' ? 'bg-blue-50/80 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/50' :
                          div.color === 'green' ? 'bg-emerald-50/80 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/50' : 'bg-amber-50/80 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/50'
                      )}>
                        <div className="flex justify-between items-center">
                          <h3 className="font-bold text-slate-800 dark:text-slate-100">{div.name}</h3>
                          <span className={cn("text-xs font-bold uppercase tracking-wider px-3 py-1 bg-white dark:bg-slate-800 rounded-full shadow-sm",
                            div.color === 'blue' ? 'text-blue-600 dark:text-blue-400' :
                              div.color === 'green' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                          )}>{divEmployees.length} Pegawai</span>
                        </div>
                      </div>
                      <div className="p-6">
                        {/* Manager */}
                        {managers.length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Manager</h4>
                            <div className="flex flex-wrap gap-2">
                              {managers.map(emp => (
                                <span key={emp.id} className="px-3 py-1.5 bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 rounded-lg text-sm font-medium border border-purple-200 dark:border-purple-800/50">
                                  {emp.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Asman */}
                        {asmans.length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Asman</h4>
                            <div className="flex flex-wrap gap-2">
                              {asmans.map(emp => (
                                <span key={emp.id} className="px-3 py-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-lg text-sm font-medium border border-blue-200 dark:border-blue-800/50">
                                  {emp.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Staf */}
                        {stafs.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Staf</h4>
                            <div className="flex flex-wrap gap-2">
                              {stafs.map(emp => (
                                <span key={emp.id} className="px-3 py-1.5 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 rounded-lg text-sm font-medium border border-emerald-200 dark:border-emerald-800/50">
                                  {emp.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Full Table */}
              <div className="mt-10">
                <div className="flex items-center gap-3 mb-6">
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Tabel Lengkap Pegawai</h3>
                  <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                </div>
                <div className="overflow-x-auto rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <table className="w-full">
                    <thead className="bg-slate-50/50 dark:bg-slate-800/50 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-16">No</th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nama</th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Jabatan</th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Divisi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900/20">
                      {EMPLOYEES.map((emp, i) => {
                        const div = DIVISIONS.find(d => d.id === emp.division);
                        return (
                          <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors duration-150">
                            <td className="px-6 py-4 text-sm font-medium text-slate-500">{i + 1}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-700">{emp.name}</td>
                            <td className="px-6 py-4">
                              <span className={cn("px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wide",
                                emp.level === 'manager' ? 'bg-purple-100 text-purple-700' :
                                  emp.level === 'asman' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                              )}>
                                {emp.position}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn("px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wide",
                                div?.color === 'blue' ? 'bg-blue-100 text-blue-700' :
                                  div?.color === 'green' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                              )}>
                                {div?.name}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Report Tab */}
        {activeTab === 'laporan' && (
          <div className="space-y-6 animate-fade-in-up">
            <div className="glass-card rounded-3xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-3xl -z-10"></div>
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Laporan Kegiatan Direksi</h2>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-medium">Periode: {MONTHS[selectedMonth - 1]} {selectedYear}</p>
                </div>
                <button className="flex items-center gap-2 bg-slate-800 dark:bg-slate-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Cetak Laporan
                </button>
              </div>

              {/* Report Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                {stats.byDivision.map(div => {
                  const divMonthly = monthlyPlans.filter(p => p.divisi === div.id && p.bulan === selectedMonth && p.tahun === selectedYear);
                  const selesai = divMonthly.filter(p => p.status === 'selesai').length;
                  const dalamPekerjaan = divMonthly.filter(p => p.status === 'dalam_pekerjaan').length;
                  const progres = divMonthly.length > 0 ? Math.round((selesai / divMonthly.length) * 100) : 0;

                  return (
                    <div key={div.id} className={cn("p-6 rounded-2xl border bg-slate-50/30 dark:bg-slate-800/30 overflow-hidden shadow-sm hover:shadow-md transition-shadow relative group",
                      div.color === 'blue' ? 'border-blue-200/60 dark:border-blue-800/60' :
                        div.color === 'green' ? 'border-emerald-200/60 dark:border-emerald-800/60' : 'border-amber-200/60 dark:border-amber-800/60'
                    )}>
                      <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-300",
                        div.color === 'blue' ? 'bg-blue-500' :
                          div.color === 'green' ? 'bg-emerald-500' : 'bg-amber-500'
                      )}></div>
                      <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-4">{div.name}</h4>
                      <div className="space-y-3 relative z-10">
                        <div className="flex justify-between text-sm font-medium">
                          <span className="text-slate-500 dark:text-slate-400">Total Program:</span>
                          <span className="text-slate-800 dark:text-slate-200">{divMonthly.length}</span>
                        </div>
                        <div className="flex justify-between text-sm font-medium">
                          <span className="text-slate-500 dark:text-slate-400">Selesai:</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">{selesai}</span>
                        </div>
                        <div className="flex justify-between text-sm font-medium">
                          <span className="text-slate-500 dark:text-slate-400">Dalam Pekerjaan:</span>
                          <span className="text-blue-600 dark:text-blue-400 font-bold">{dalamPekerjaan}</span>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-700/50">
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-slate-500 dark:text-slate-400 font-bold">Progres:</span>
                            <span className="font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-700 to-slate-900 dark:from-slate-200 dark:to-white">{progres}%</span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner flex items-center p-[2px]">
                            <div
                              className={cn("h-full rounded-full transition-all duration-1000",
                                div.color === 'blue' ? 'bg-gradient-to-r from-blue-400 to-blue-600' :
                                  div.color === 'green' ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-amber-400 to-amber-600'
                              )}
                              style={{ width: `${progres}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Detailed Report by Division */}
              {(currentDivision === 'direksi' || !currentDivision
                ? DIVISIONS.filter(d => d.id !== 'direksi')
                : DIVISIONS.filter(d => d.id === currentDivision)
              ).map(div => {
                const divMonthly = monthlyPlans.filter(p => p.divisi === div.id && p.bulan === selectedMonth && p.tahun === selectedYear);
                const divWeekly = weeklyPlans.filter(p => p.divisi === div.id && p.bulan === selectedMonth && p.tahun === selectedYear);

                if (divMonthly.length === 0) return null;

                return (
                  <div key={div.id} className={cn("rounded-2xl border bg-white dark:bg-slate-900 overflow-hidden mb-8 shadow-sm transition-shadow hover:shadow-md",
                    div.color === 'blue' ? 'border-blue-200/60 dark:border-blue-800/60' :
                      div.color === 'green' ? 'border-emerald-200/60 dark:border-emerald-800/60' : 'border-amber-200/60 dark:border-amber-800/60'
                  )}>
                    <div className={cn("px-6 py-4 border-b",
                      div.color === 'blue' ? 'bg-blue-50/80 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/50' :
                        div.color === 'green' ? 'bg-emerald-50/80 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/50' : 'bg-amber-50/80 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/50'
                    )}>
                      <h3 className="font-bold text-slate-800 dark:text-slate-100">{div.name}</h3>
                    </div>
                    <div className="p-6">
                      <h4 className="font-bold text-sm tracking-wide uppercase text-slate-500 dark:text-slate-400 mb-4">Rencana Bulanan</h4>
                      <div className="space-y-3">
                        {divMonthly.map(plan => (
                          <div key={plan.id} className="flex items-start justify-between p-4 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-700/50 hover:border-slate-200 dark:hover:border-slate-600 transition-colors">
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-slate-800 dark:text-slate-200">{plan.program}</h4>
                                <span className={cn("px-3 py-1 flex items-center gap-1.5 rounded-full text-xs font-bold uppercase tracking-wide",
                                  plan.status === 'selesai' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                    plan.status === 'dalam_pekerjaan' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                      plan.status === 'ditunda' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-400'
                                )}>
                                  <span className={cn("w-1.5 h-1.5 rounded-full",
                                    plan.status === 'selesai' ? 'bg-emerald-500' :
                                      plan.status === 'dalam_pekerjaan' ? 'bg-blue-500' :
                                        plan.status === 'ditunda' ? 'bg-red-500' : 'bg-slate-500'
                                  )}></span>
                                  {STATUS_OPTIONS.find(s => s.value === plan.status)?.label}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {divWeekly.length > 0 && (
                        <>
                          <div className="h-px bg-slate-100 dark:bg-slate-800 my-6"></div>
                          <h4 className="font-bold text-sm tracking-wide uppercase text-slate-500 dark:text-slate-400 mb-4">Rencana Mingguan</h4>
                          <div className="space-y-6">
                            {[1, 2, 3, 4, 5].map(weekNum => {
                              const plansForWeek = divWeekly.filter(wp => getWeekOfMonth(wp.tanggal_mulai) === weekNum);
                              if (plansForWeek.length === 0) return null;
                              return (
                                <div key={weekNum} className="ml-4">
                                  <h5 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-2">
                                    <span className="w-8 h-px bg-slate-200 dark:bg-slate-700"></span>
                                    Minggu Ke-{weekNum}
                                    <span className="flex-1 h-px bg-slate-200 dark:bg-slate-700"></span>
                                  </h5>
                                  <div className="border-l-2 border-slate-200 dark:border-slate-700 pl-5 space-y-4 ml-1">
                                    {plansForWeek.map(wp => (
                                      <div key={wp.id} className="flex flex-col gap-1.5">
                                        <div className="flex items-start gap-3 relative">
                                          <span className="h-3 w-3 rounded-full bg-slate-300 dark:bg-slate-600 absolute -left-[27px] top-1.5 ring-4 ring-white dark:ring-slate-900" />
                                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{wp.program}</span>
                                        </div>
                                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-6 flex flex-wrap gap-x-4 gap-y-1">
                                          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> {wp.tanggal_mulai}</span>
                                          <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> {wp.penanggung_jawab.join(', ')}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {stats.totalMonthly === 0 && (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>Belum ada laporan untuk periode ini</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Monthly Plan Modal */}
      {showMonthlyModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-300">
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-white/50 dark:border-slate-800 ring-1 ring-slate-900/5 dark:ring-white/5 transform transition-all scale-100">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 sticky top-0 z-10 flex justify-between items-center">
              <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-700 dark:from-blue-400 dark:to-indigo-400">
                {editingMonthly ? 'Edit' : 'Tambah'} Rencana Bulanan
              </h3>
              <button onClick={() => setShowMonthlyModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Nama Program</label>
                {monthlyForm.rkap_id ? (
                  <div className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-slate-50/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-medium shadow-sm">
                    {monthlyForm.program}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={monthlyForm.program}
                    onChange={(e) => setMonthlyForm(prev => ({ ...prev, program: e.target.value }))}
                    placeholder="Masukkan nama program secara manual..."
                    className="w-full border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 focus:ring-4 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 focus:border-blue-500 dark:focus:border-blue-400 outline-none transition-all font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Divisi</label>
                  <div className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-slate-50/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400"></span>
                      {DIVISIONS.find(d => d.id === currentDivision)?.name || 'Perencanaan Teknik'}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Status</label>
                  <div className="relative">
                    <select
                      value={monthlyForm.status}
                      onChange={(e) => setMonthlyForm(prev => ({ ...prev, status: e.target.value as Status }))}
                      className="w-full appearance-none border border-slate-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-bold text-slate-700"
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s.value} value={s.value} className="font-medium text-slate-800">{s.label}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3 sticky bottom-0 z-10">
              <button
                onClick={() => { setShowMonthlyModal(false); setEditingMonthly(null); }}
                className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-200/50 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveMonthly}
                disabled={!monthlyForm.program}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:hover:translate-y-0 disabled:shadow-none"
              >
                Simpan Program
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Plan Modal */}
      {showWeeklyModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-300">
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-white/50 dark:border-slate-800 ring-1 ring-slate-900/5 dark:ring-white/5 transform transition-all scale-100">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 sticky top-0 z-10 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400">
                  {editingWeekly ? 'Edit' : 'Tambah'} Rencana Mingguan
                </h3>
                {selectedMonthlyForWeekly && (
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-2 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Berdasarkan Program: <span className="text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded ml-1">{selectedMonthlyForWeekly.program}</span>
                  </p>
                )}
              </div>
              <button onClick={() => { setShowWeeklyModal(false); setEditingWeekly(null); setSelectedMonthlyForWeekly(null); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Tanggal Mulai</label>
                <input
                  type="date"
                  value={weeklyForm.tanggal_mulai}
                  onChange={(e) => setWeeklyForm(prev => ({ ...prev, tanggal_mulai: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 focus:ring-4 focus:ring-emerald-500/20 dark:focus:ring-emerald-400/20 focus:border-emerald-500 dark:focus:border-emerald-400 outline-none transition-all font-medium text-slate-800 dark:text-slate-100 [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Divisi</label>
                  <div className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-slate-50/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400"></span>
                      {DIVISIONS.find(d => d.id === currentDivision)?.name || 'Perencanaan Teknik'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Program</label>
                <input
                  type="text"
                  value={weeklyForm.program}
                  onChange={(e) => setWeeklyForm(prev => ({ ...prev, program: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 focus:ring-4 focus:ring-emerald-500/20 dark:focus:ring-emerald-400/20 focus:border-emerald-500 dark:focus:border-emerald-400 outline-none transition-all font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                  placeholder="Nama program mingguan..."
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Penanggung Jawab</label>
                  <span className={cn("text-xs font-bold px-2 py-1 rounded-md",
                    weeklyForm.penanggung_jawab.length === 0 ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" :
                      weeklyForm.penanggung_jawab.length >= 6 ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                  )}>
                    {weeklyForm.penanggung_jawab.length}/6 Terpilih
                  </span>
                </div>
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 max-h-48 overflow-y-auto bg-slate-50/50 dark:bg-slate-800/30 space-y-1 shadow-inner custom-scrollbar">
                  {getEmployeesByDivision(weeklyForm.divisi).map(emp => (
                    <label key={emp.id} className={cn("flex items-center gap-3 cursor-pointer p-2.5 rounded-lg transition-all border",
                      weeklyForm.penanggung_jawab.includes(emp.name)
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800/50 dark:text-emerald-300 shadow-sm"
                        : "border-transparent hover:bg-white hover:border-slate-200 hover:shadow-sm dark:hover:bg-slate-800/50 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300"
                    )}>
                      <input
                        type="checkbox"
                        checked={weeklyForm.penanggung_jawab.includes(emp.name)}
                        onChange={(e) => {
                          setWeeklyForm(prev => {
                            let newPj = [...prev.penanggung_jawab];
                            if (e.target.checked) {
                              if (newPj.length < 6) newPj.push(emp.name);
                            } else {
                              newPj = newPj.filter(p => p !== emp.name);
                            }
                            return { ...prev, penanggung_jawab: newPj };
                          });
                        }}
                        className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700 text-emerald-600 focus:ring-emerald-500 dark:focus:ring-emerald-400 dark:ring-offset-slate-900 w-4 h-4 cursor-pointer"
                      />
                      <span className="font-bold leading-none">{emp.name} <span className="opacity-70 text-xs ml-1.5 font-semibold bg-emerald-100/50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">{emp.position}</span></span>
                    </label>
                  ))}
                </div>
              </div>

            </div>
            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end gap-3 sticky bottom-0 z-10">
              <button
                onClick={() => { setShowWeeklyModal(false); setEditingWeekly(null); setSelectedMonthlyForWeekly(null); }}
                className="px-6 py-2.5 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-200/50 dark:hover:bg-slate-800/50 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveWeekly}
                disabled={!weeklyForm.program || weeklyForm.penanggung_jawab.length === 0}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 dark:from-emerald-600 dark:to-teal-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:hover:translate-y-0 disabled:shadow-none"
              >
                Simpan Tanggung Jawab
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
