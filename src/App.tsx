import { useState, useMemo, useEffect } from 'react';
import { DIVISIONS, MONTHS, STATUS_OPTIONS, DEFAULT_RKAP_PROGRAMS, BRANCHES, EMPLOYEES, getEmployeesByDivision, SUB_DIVISIONS, type Division, type SubDivision, type MonthlyPlan, type WeeklyPlan, type Status } from './types';
import { cn } from './utils/cn';
import { Sun, Moon, ChevronDown, ChevronRight } from 'lucide-react';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rkap' | 'bulanan' | 'mingguan' | 'laporan' | 'pegawai'>(
    loadCurrentDivision() === 'direksi' ? 'laporan' : 'dashboard'
  );
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
    sub_divisi: undefined as SubDivision | undefined,
  });

  const [weeklyForm, setWeeklyForm] = useState({
    monthly_plan_id: '',
    program: '',
    divisi: 'perencanaan_teknik' as Division,
    sub_divisi: undefined as SubDivision | undefined,
    catatan: '',
    tanggal_mulai: '',
    penanggung_jawab: [] as string[],
    status: 'rencana' as Status,
  });
  const [isUploadingId, setIsUploadingId] = useState<string | null>(null);

  // Login Password States
  const [selectedLoginDivision, setSelectedLoginDivision] = useState<Division | null>(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Accordion state for Laporan Direksi
  const [expandedSubDivisions, setExpandedSubDivisions] = useState<Record<string, boolean>>({});

  const toggleSubDivision = (subDivId: string) => {
    setExpandedSubDivisions(prev => ({
      ...prev,
      [subDivId]: !prev[subDivId]
    }));
  };

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

  // Laporan Direksi Filter State
  const [laporanSelectedDivision, setLaporanSelectedDivision] = useState<Division>('perencanaan_teknik');

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
      selesai: weeklyFiltered.filter(p => p.divisi === div.id && p.status === 'selesai').length,
    }));

    const statusCounts = STATUS_OPTIONS.map(s => ({
      ...s,
      count: divisionWeeklyFiltered.filter(p => p.status === s.value).length,
    }));

    return { byDivision, statusCounts, totalMonthly: divisionMonthlyFiltered.length, totalWeekly: divisionWeeklyFiltered.length };
  }, [monthlyPlans, weeklyPlans, selectedMonth, selectedYear, currentDivision]);

  // Handlers
  const handleDivisionSelect = (divisionId: Division) => {
    if (divisionId === 'direksi') {
      setCurrentDivision(divisionId);
      saveCurrentDivision(divisionId);
      setActiveTab('laporan');
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
      sub_divisi: monthlyForm.sub_divisi,
      bulan: selectedMonth,
      tahun: selectedYear,
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
      sub_divisi: undefined,
    });
  };

  const handleAddFromRKAP = (prog: typeof DEFAULT_RKAP_PROGRAMS[0]) => {
    setMonthlyForm({
      rkap_id: prog.id,
      program: prog.program,
      divisi: currentDivision && currentDivision !== 'direksi' ? currentDivision : 'perencanaan_teknik',
      sub_divisi: undefined,
    });
    setEditingMonthly(null);
    setShowMonthlyModal(true);
  };

  const handleSaveWeekly = async () => {
    const planData: Omit<WeeklyPlan, 'id'> = {
      monthly_plan_id: weeklyForm.monthly_plan_id,
      program: weeklyForm.program,
      divisi: currentDivision && currentDivision !== 'direksi' ? currentDivision : 'perencanaan_teknik',
      sub_divisi: weeklyForm.sub_divisi,
      catatan: weeklyForm.catatan,
      bulan: selectedMonth,
      tahun: selectedYear,
      tanggal_mulai: weeklyForm.tanggal_mulai,
      penanggung_jawab: weeklyForm.penanggung_jawab,
      status: weeklyForm.status || 'rencana',
    };

    try {
      if (editingWeekly) {
        // Update existing (keep old urls)
        const docRef = doc(db, 'weeklyPlans', editingWeekly.id);
        await updateDoc(docRef, planData); // updateDoc will merge, not replace undefined
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

  const handleUploadPhotoTerpisah = async (planId: string, currentUrls: string[] = [], files: FileList | null) => {
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
    if (filesArray.length + currentUrls.length > 3) {
      alert('Maksimal hanya 3 foto yang diperbolehkan dalam satu laporan mingguan.');
      return;
    }

    setIsUploadingId(planId);
    let uploadedUrls = [...currentUrls];

    const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/dd4eq9rxe/image/upload';
    const UPLOAD_PRESET = 'foto_pekerjaan';

    try {
      // Upload ke Cloudinary
      for (const file of filesArray) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', UPLOAD_PRESET);

        const response = await fetch(CLOUDINARY_URL, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Upload failed with status ${response.status}`);
        }

        const data = await response.json();
        uploadedUrls.push(data.secure_url);
      }

      // Simpan URL ke Firestore
      const docRef = doc(db, 'weeklyPlans', planId);
      await updateDoc(docRef, { foto_urls: uploadedUrls });

    } catch (error) {
      console.error("Error uploading photos to Cloudinary:", error);
      alert("Gagal mengupload foto ke server.");
    } finally {
      setIsUploadingId(null);
    }
  };

  const handleDeletePhotoTerpisah = async (planId: string, currentUrls: string[], photoIndex: number) => {
    if (!confirm('Hapus foto ini dari laporan?')) return;

    try {
      const updatedUrls = currentUrls.filter((_, idx) => idx !== photoIndex);
      const docRef = doc(db, 'weeklyPlans', planId);
      await updateDoc(docRef, { foto_urls: updatedUrls });
    } catch (error) {
      console.error("Error deleting photo:", error);
      alert("Gagal menghapus foto.");
    }
  };

  const handleEditWeekly = (plan: WeeklyPlan) => {
    setWeeklyForm({
      monthly_plan_id: plan.monthly_plan_id,
      program: plan.program,
      divisi: plan.divisi,
      sub_divisi: plan.sub_divisi,
      catatan: plan.catatan || '',
      tanggal_mulai: plan.tanggal_mulai,
      penanggung_jawab: [...plan.penanggung_jawab],
      status: plan.status,
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
      sub_divisi: undefined,
      catatan: '',
      tanggal_mulai: '',
      penanggung_jawab: [],
      status: 'rencana',
    });
  };

  const openWeeklyModalForMonthly = (monthly: MonthlyPlan) => {
    setSelectedMonthlyForWeekly(monthly);
    setWeeklyForm({
      monthly_plan_id: monthly.id,
      program: monthly.program,
      divisi: monthly.divisi,
      sub_divisi: monthly.sub_divisi,
      catatan: '',
      tanggal_mulai: '',
      penanggung_jawab: [],
      status: 'rencana',
    });
    setEditingWeekly(null);
    setShowWeeklyModal(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
  };

  const handleLogout = () => {
    localStorage.removeItem(CURRENT_DIVISION_KEY);
    setCurrentDivision(null);
    setActiveTab('dashboard');
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
            <div className="h-60 w-60 glass-button rounded-2xl flex items-center justify-center mx-auto mb-6 transform hover:scale-105 transition-transform duration-300 overflow-hidden bg-white/50 dark:bg-black/20">
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
          ].filter(tab => currentDivision === 'direksi' ? tab.id === 'laporan' : true).map(tab => (
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
                { title: 'Program Bulanan', value: stats.totalMonthly, borderTop: 'border-blue-500', bgAccent: 'bg-blue-500/15', gradient: 'from-blue-600 to-indigo-600', bgIcon: 'bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-indigo-900/40', textIcon: 'text-blue-600 dark:text-blue-400', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                { title: 'Program Mingguan', value: stats.totalWeekly, borderTop: 'border-emerald-500', bgAccent: 'bg-emerald-500/15', gradient: 'from-emerald-600 to-teal-600', bgIcon: 'bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/40 dark:to-teal-900/40', textIcon: 'text-emerald-600 dark:text-emerald-400', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                { title: 'Selesai', value: stats.statusCounts.find(s => s.value === 'selesai')?.count || 0, borderTop: 'border-green-500', bgAccent: 'bg-green-500/15', gradient: 'from-green-600 to-emerald-600', bgIcon: 'bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900/40 dark:to-emerald-900/40', textIcon: 'text-green-600 dark:text-green-400', icon: 'M5 13l4 4L19 7' },
                { title: 'Dalam Pekerjaan', value: stats.statusCounts.find(s => s.value === 'dalam_pekerjaan')?.count || 0, borderTop: 'border-amber-500', bgAccent: 'bg-amber-500/15', gradient: 'from-amber-500 to-orange-500', bgIcon: 'bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-orange-900/40', textIcon: 'text-amber-600 dark:text-amber-400', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
              ].map((stat, idx) => (
                <div key={idx} className={`glass-card rounded-3xl p-6 relative overflow-hidden group border-t-4 ${stat.borderTop} shadow-sm hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1`} style={{ animationDelay: `${idx * 100}ms` }}>
                  <div className={`absolute -right-6 -top-6 w-32 h-32 rounded-full ${stat.bgAccent} blur-3xl group-hover:scale-150 transition-transform duration-700`}></div>
                  <div className="flex justify-between items-start relative z-10">
                    <div>
                      <p className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-wider mb-2">{stat.title}</p>
                      <p className={`text-4xl sm:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-br ${stat.gradient} drop-shadow-sm tracking-tight`}>
                        {stat.value}
                      </p>
                    </div>
                    <div className={`h-14 w-14 ${stat.bgIcon} rounded-2xl flex items-center justify-center shadow-inner transform group-hover:rotate-6 group-hover:scale-110 transition-transform duration-300 ring-1 ring-white/50 dark:ring-white/10`}>
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
                  {stats.byDivision.map(div => {
                    const totalTarget = div.monthly;
                    const completionRate = totalTarget > 0 ? Math.round((div.selesai / totalTarget) * 100) : 0;
                    return (
                      <div key={div.id} className={cn("p-5 rounded-2xl border transition-all duration-300 hover:shadow-lg relative overflow-hidden group transform hover:-translate-y-0.5",
                        div.color === 'blue' ? 'border-blue-200/60 dark:border-blue-800/60 bg-gradient-to-br from-blue-50/80 to-white dark:from-slate-800 dark:to-slate-800/80' :
                          div.color === 'green' ? 'border-emerald-200/60 dark:border-emerald-800/60 bg-gradient-to-br from-emerald-50/80 to-white dark:from-slate-800 dark:to-slate-800/80' :
                            div.color === 'purple' ? 'border-purple-200/60 dark:border-purple-800/60 bg-gradient-to-br from-purple-50/80 to-white dark:from-slate-800 dark:to-slate-800/80' :
                              'border-amber-200/60 dark:border-amber-800/60 bg-gradient-to-br from-amber-50/80 to-white dark:from-slate-800 dark:to-slate-800/80'
                      )}>
                        <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-300",
                          div.color === 'blue' ? 'bg-blue-500' :
                            div.color === 'green' ? 'bg-emerald-500' :
                              div.color === 'purple' ? 'bg-purple-500' :
                                'bg-amber-500'
                        )}></div>

                        <div className="flex justify-between items-center mb-4 relative z-10">
                          <h4 className="font-bold text-slate-800 dark:text-slate-100">{div.name}</h4>
                          <span className={cn("text-xs font-bold px-2.5 py-1 rounded-md",
                            completionRate >= 100 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                              completionRate >= 50 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" :
                                "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                          )}>
                            {completionRate}% Selesai
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-center divide-x divide-slate-200/60 dark:divide-slate-700/60 mb-4 relative z-10">
                          <div>
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Bulanan</p>
                            <p className="text-2xl font-extrabold text-slate-800 dark:text-slate-200">{div.monthly}</p>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Mingguan</p>
                            <p className="text-2xl font-extrabold text-slate-800 dark:text-slate-200">{div.weekly}</p>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Capaian</p>
                            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{div.selesai}</p>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800/80 rounded-full overflow-hidden shadow-inner flex items-center p-[2px] relative z-10">
                          <div
                            className={cn("h-full rounded-full transition-all duration-1000 relative overflow-hidden",
                              div.color === 'blue' ? 'bg-gradient-to-r from-blue-400 to-blue-600' :
                                div.color === 'green' ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' :
                                  div.color === 'purple' ? 'bg-gradient-to-r from-purple-400 to-purple-600' : 'bg-gradient-to-r from-amber-400 to-amber-600'
                            )}
                            style={{ width: `${completionRate}%` }}
                          >
                            <div className="absolute top-0 inset-x-0 w-full h-[1px] bg-white/30"></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Activities */}
              <div className="glass-card rounded-3xl p-6 flex flex-col h-full">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Program Terbaru</h3>
                  <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-pointer" title="Lihat Selengkapnya">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </div>
                </div>
                <div className="space-y-3 flex-1">
                  {filteredMonthlyPlans.slice(0, 5).map(plan => {
                    const div = DIVISIONS.find(d => d.id === plan.divisi);
                    return (
                      <div key={plan.id} className="group relative flex items-center p-4 bg-white/60 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/50 hover:border-blue-200 dark:hover:border-blue-500/30 rounded-2xl transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 overflow-hidden">

                        <div className="ml-2 mr-4 flex-shrink-0 flex justify-center items-center w-8 h-8 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{plan.program}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded",
                              div?.color === 'blue' ? 'bg-blue-100/50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' :
                                div?.color === 'green' ? 'bg-emerald-100/50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' :
                                  'bg-amber-100/50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                            )}>
                              {div?.name}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredMonthlyPlans.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 space-y-3 py-8">
                      <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center border border-slate-100 dark:border-slate-700 shadow-inner">
                        <svg className="w-8 h-8 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                      </div>
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
            {/* Header */}
            <div className="flex items-center justify-between bg-white/50 dark:bg-slate-900/50 backdrop-blur-md p-4 rounded-3xl border border-white/60 dark:border-slate-700/50 shadow-sm">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 ml-2">Rencana Kerja Bulanan</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 ml-2 mt-0.5">Program dikelompokkan per Sub Divisi · Pilih dari tab RKAP atau tambah manual</p>
              </div>
              {currentDivision !== 'direksi' && (
                <button
                  onClick={() => { resetMonthlyForm(); setEditingMonthly(null); setShowMonthlyModal(true); }}
                  className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  Tambah Manual
                </button>
              )}
            </div>

            {/* Grouped by Sub-Division */}
            {(() => {
              const divObj = DIVISIONS.find(d => d.id === (currentDivision && currentDivision !== 'direksi' ? currentDivision : 'perencanaan_teknik'));
              const thisDivSubs = currentDivision && currentDivision !== 'direksi' ? SUB_DIVISIONS[currentDivision] : [];
              const unassigned = filteredMonthlyPlans.filter(p => !p.sub_divisi || !thisDivSubs.find(s => s.id === p.sub_divisi));
              const groups = [
                ...thisDivSubs.map(sub => ({
                  sub,
                  plans: filteredMonthlyPlans.filter(p => p.sub_divisi === sub.id),
                })),
                ...(unassigned.length > 0 ? [{ sub: { id: '__unassigned__' as any, name: 'Umum' }, plans: unassigned }] : []),
              ];

              if (filteredMonthlyPlans.length === 0) return (
                <div className="glass-card rounded-3xl p-16 text-center text-slate-400 dark:text-slate-500">
                  <svg className="w-16 h-16 mx-auto mb-4 text-slate-200 dark:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="font-semibold text-lg">Belum ada program dipilih bulan ini</p>
                  <p className="text-sm mt-2">Pergi ke tab <strong>Program RKAP</strong> dan pilih program yang akan dikerjakan</p>
                </div>
              );

              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {thisDivSubs.map(sub => {
                    const plans = filteredMonthlyPlans.filter(p => p.sub_divisi === sub.id);
                    return (
                      <div key={sub.id} className={cn("glass-card rounded-2xl overflow-hidden border",
                        divObj?.color === 'blue' ? 'border-blue-100 dark:border-blue-900/40' :
                          divObj?.color === 'green' ? 'border-emerald-100 dark:border-emerald-900/40' : 'border-amber-100 dark:border-amber-900/40'
                      )}>
                        {/* Sub-division header */}
                        <div className={cn("px-4 py-3 flex items-center justify-between border-b",
                          divObj?.color === 'blue' ? 'bg-blue-50/80 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/40' :
                            divObj?.color === 'green' ? 'bg-emerald-50/80 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/40' : 'bg-amber-50/80 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/40'
                        )}>
                          <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">{sub.name}</h3>
                          <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full",
                            divObj?.color === 'blue' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                              divObj?.color === 'green' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          )}>{plans.length} program</span>
                        </div>

                        {/* Program list */}
                        <div className="divide-y divide-slate-50 dark:divide-slate-800">
                          {plans.length === 0 ? (
                            <p className="px-4 py-5 text-xs text-slate-400 dark:text-slate-500 italic text-center">Belum ada program</p>
                          ) : plans.map((plan, i) => {
                            const weeklyCount = filteredWeeklyPlans.filter(w => w.monthly_plan_id === plan.id).length;
                            const selesaiCount = filteredWeeklyPlans.filter(w => w.monthly_plan_id === plan.id && w.status === 'selesai').length;
                            return (
                              <div key={plan.id} className="px-4 py-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors group flex items-start gap-3">
                                <span className="text-xs font-bold text-slate-300 dark:text-slate-600 mt-1 w-4 shrink-0">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-snug">{plan.program}</p>
                                  {weeklyCount > 0 && (
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                      {selesaiCount}/{weeklyCount} laporan selesai
                                    </p>
                                  )}
                                </div>
                                {currentDivision !== 'direksi' && (
                                  <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => handleDeleteMonthly(plan.id)}
                                      title="Hapus"
                                      className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-400/10 rounded-lg transition-colors"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* Weekly Plan Tab */}
        {activeTab === 'mingguan' && (
          <div className="space-y-6 animate-fade-in-up">
            {/* Header */}
            <div className="flex items-center justify-between bg-white/50 dark:bg-slate-900/50 backdrop-blur-md p-4 rounded-3xl border border-white/60 dark:border-slate-700/50 shadow-sm">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 ml-2">Laporan Mingguan</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 ml-2 mt-0.5">Klik <strong>+</strong> pada program untuk tambah detail pekerjaan · {MONTHS[selectedMonth - 1]} {selectedYear}</p>
              </div>
            </div>

            {filteredMonthlyPlans.length === 0 ? (
              <div className="glass-card rounded-3xl p-16 text-center text-slate-400 dark:text-slate-500">
                <svg className="w-16 h-16 mx-auto mb-4 text-slate-200 dark:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="font-semibold text-lg">Belum ada program di bulan ini</p>
                <p className="text-sm mt-2">Tambahkan program di tab <strong>Rencana Bulanan</strong> terlebih dahulu</p>
              </div>
            ) : (() => {
              const thisDivision = currentDivision && currentDivision !== 'direksi' ? currentDivision : 'perencanaan_teknik';
              const thisSubs = SUB_DIVISIONS[thisDivision as keyof typeof SUB_DIVISIONS] || [];
              const divObj = DIVISIONS.find(d => d.id === thisDivision);

              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {thisSubs.map(sub => {
                    const subPrograms = filteredMonthlyPlans.filter(p => p.sub_divisi === sub.id);
                    const subWeeklyTotal = filteredWeeklyPlans.filter(p => p.sub_divisi === sub.id).length;

                    return (
                      <div key={sub.id} className={cn("glass-card rounded-2xl overflow-hidden border flex flex-col",
                        divObj?.color === 'blue' ? 'border-blue-100 dark:border-blue-900/40' :
                          divObj?.color === 'green' ? 'border-emerald-100 dark:border-emerald-900/40' : 'border-amber-100 dark:border-amber-900/40'
                      )}>
                        {/* Column Header */}
                        <div className={cn("px-4 py-3 border-b",
                          divObj?.color === 'blue' ? 'bg-blue-50/80 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/40' :
                            divObj?.color === 'green' ? 'bg-emerald-50/80 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/40' : 'bg-amber-50/80 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/40'
                        )}>
                          <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">{sub.name}</h3>
                            <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full",
                              divObj?.color === 'blue' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                                divObj?.color === 'green' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            )}>{subPrograms.length} program · {subWeeklyTotal} laporan</span>
                          </div>
                        </div>

                        {/* Programs list */}
                        <div className="flex-1 divide-y divide-slate-50 dark:divide-slate-800 overflow-y-auto max-h-[80vh]">
                          {subPrograms.length === 0 ? (
                            <p className="px-4 py-6 text-xs text-slate-400 dark:text-slate-500 italic text-center">Belum ada program</p>
                          ) : subPrograms.map(prog => {
                            const progWeekly = filteredWeeklyPlans.filter(w => w.monthly_plan_id === prog.id);
                            const latestStatus = progWeekly.length > 0 ? progWeekly[progWeekly.length - 1].status : null;

                            return (
                              <div key={prog.id} className="px-4 pt-3 pb-4">
                                {/* Program name + add button */}
                                <div className="flex items-start gap-2 mb-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-snug">{prog.program}</p>
                                    {latestStatus && (
                                      <span className={cn("inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mt-1",
                                        latestStatus === 'selesai' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                          latestStatus === 'dalam_pekerjaan' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                            latestStatus === 'ditunda' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                      )}>{STATUS_OPTIONS.find(s => s.value === latestStatus)?.label}</span>
                                    )}
                                  </div>
                                  {currentDivision !== 'direksi' && (
                                    <button
                                      onClick={() => openWeeklyModalForMonthly(prog)}
                                      title="Tambah detail pekerjaan"
                                      className={cn("shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-bold transition-colors shadow-sm",
                                        divObj?.color === 'blue' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50' :
                                          divObj?.color === 'green' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50' : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50'
                                      )}
                                    >
                                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                      </svg>
                                    </button>
                                  )}
                                </div>

                                {/* Weekly plan entries */}
                                {progWeekly.length > 0 && (
                                  <div className="space-y-1.5 ml-0">
                                    {progWeekly.map(wp => (
                                      <div key={wp.id} className={cn("rounded-xl px-3 py-2 text-[11px] border group relative",
                                        wp.status === 'selesai' ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/30' :
                                          wp.status === 'dalam_pekerjaan' ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/30' :
                                            wp.status === 'ditunda' ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800/30' : 'bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-700/30'
                                      )}>
                                        {/* Row 1: status + date */}
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                          <span className={cn("font-bold uppercase tracking-wide text-[10px]",
                                            wp.status === 'selesai' ? 'text-emerald-700 dark:text-emerald-400' :
                                              wp.status === 'dalam_pekerjaan' ? 'text-blue-700 dark:text-blue-400' :
                                                wp.status === 'ditunda' ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
                                          )}>
                                            {STATUS_OPTIONS.find(s => s.value === wp.status)?.label}
                                          </span>
                                          <span className="text-slate-400 dark:text-slate-500 font-medium shrink-0">{wp.tanggal_mulai}</span>
                                        </div>

                                        {/* Catatan */}
                                        {wp.catatan && <p className="text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed mb-1">{wp.catatan}</p>}

                                        {/* PJ */}
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-slate-400 dark:text-slate-500 truncate">
                                            {wp.penanggung_jawab.slice(0, 2).join(', ')}{wp.penanggung_jawab.length > 2 ? ` +${wp.penanggung_jawab.length - 2}` : ''}
                                          </span>
                                          {/* Photos */}
                                          {wp.foto_urls && wp.foto_urls.length > 0 && (
                                            <div className="flex gap-1 shrink-0">
                                              {wp.foto_urls.slice(0, 2).map((url, i) => (
                                                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                                  className="block w-7 h-7 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 hover:ring-1 hover:ring-blue-400 transition-all shrink-0">
                                                  <img src={url} alt="" className="w-full h-full object-cover" />
                                                </a>
                                              ))}
                                              {wp.foto_urls.length > 2 && (
                                                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-[9px] font-bold text-slate-500 border border-slate-200 dark:border-slate-700">
                                                  +{wp.foto_urls.length - 2}
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </div>

                                        {/* Upload + Edit + Delete (hover) */}
                                        {currentDivision !== 'direksi' && (
                                          <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-700/30 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {/* Upload foto */}
                                            {(!wp.foto_urls || wp.foto_urls.length < 3) && (
                                              <label className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg cursor-pointer transition-colors">
                                                {isUploadingId === wp.id
                                                  ? <svg className="animate-spin w-2.5 h-2.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                                                  : <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                }
                                                Foto
                                                <input type="file" multiple accept="image/*" className="hidden"
                                                  disabled={isUploadingId === wp.id}
                                                  onChange={(e) => handleUploadPhotoTerpisah(wp.id, wp.foto_urls || [], e.target.files)} />
                                              </label>
                                            )}
                                            {/* Delete existing photos */}
                                            {wp.foto_urls && wp.foto_urls.map((url, i) => null)}
                                            <div className="flex gap-1.5 ml-auto">
                                              <button onClick={() => handleEditWeekly(wp)}
                                                className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20 rounded-lg transition-colors">
                                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                Edit
                                              </button>
                                              <button onClick={() => handleDeleteWeekly(wp.id)}
                                                className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-900/20 rounded-lg transition-colors">
                                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                Hapus
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
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

            {/* ── TOP HEADER ─────────────────────────────── */}
            <div className="glass-card rounded-3xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-3xl -z-10"></div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Laporan Direksi</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Periode: <strong>{MONTHS[selectedMonth - 1]} {selectedYear}</strong></p>
                </div>
                <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 dark:bg-slate-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                  Cetak
                </button>
              </div>

              {/* Summary Stats Row */}
              <div className="grid grid-cols-3 gap-4 mt-6">
                {stats.byDivision.map(div => {
                  const divWeekly = weeklyPlans.filter(p => p.divisi === div.id && p.bulan === selectedMonth && p.tahun === selectedYear);
                  const divMonthly = monthlyPlans.filter(p => p.divisi === div.id && p.bulan === selectedMonth && p.tahun === selectedYear);
                  const selesai = divWeekly.filter(p => p.status === 'selesai').length;
                  const progres = divWeekly.length > 0 ? Math.round((selesai / divWeekly.length) * 100) : 0;
                  return (
                    <div key={div.id} className={cn("rounded-2xl p-4 border relative overflow-hidden",
                      div.color === 'blue' ? 'bg-blue-50/60 dark:bg-blue-900/10 border-blue-200/60 dark:border-blue-800/60' :
                        div.color === 'green' ? 'bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-200/60 dark:border-emerald-800/60' : 'bg-amber-50/60 dark:bg-amber-900/10 border-amber-200/60 dark:border-amber-800/60'
                    )}>
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 truncate">{div.name.replace('Divisi ', '')}</p>
                      <div className="flex items-end gap-2 mb-2">
                        <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{progres}%</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 mb-1">{selesai}/{divWeekly.length} selesai</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200/80 dark:bg-slate-700/80 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all duration-700",
                          div.color === 'blue' ? 'bg-blue-500' : div.color === 'green' ? 'bg-emerald-500' : 'bg-amber-500'
                        )} style={{ width: `${progres}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{divMonthly.length} program terdaftar</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── PER-DIVISION + 3 SUB-DIVISI COLUMNS ──── */}
            {(currentDivision === 'direksi' || !currentDivision
              ? DIVISIONS.filter(d => d.id !== 'direksi')
              : DIVISIONS.filter(d => d.id === currentDivision)
            ).map(div => {
              const divMonthly = monthlyPlans.filter(p => p.divisi === div.id && p.bulan === selectedMonth && p.tahun === selectedYear);
              const divWeekly = weeklyPlans.filter(p => p.divisi === div.id && p.bulan === selectedMonth && p.tahun === selectedYear);
              const subDivisions = SUB_DIVISIONS[div.id as keyof typeof SUB_DIVISIONS] || [];

              return (
                <div key={div.id} className={cn("rounded-3xl border overflow-hidden shadow-sm",
                  div.color === 'blue' ? 'border-blue-200/60 dark:border-blue-800/60' :
                    div.color === 'green' ? 'border-emerald-200/60 dark:border-emerald-800/60' : 'border-amber-200/60 dark:border-amber-800/60'
                )}>
                  {/* Division title bar */}
                  <div className={cn("px-6 py-4 flex items-center gap-3",
                    div.color === 'blue' ? 'bg-blue-600 dark:bg-blue-800' :
                      div.color === 'green' ? 'bg-emerald-600 dark:bg-emerald-800' : 'bg-amber-600 dark:bg-amber-800'
                  )}>
                    <h3 className="font-bold text-white text-base">{div.name}</h3>
                    <span className="ml-auto text-xs font-bold bg-white/20 text-white px-2.5 py-1 rounded-full">
                      {divMonthly.length} Program · {divWeekly.length} Laporan
                    </span>
                  </div>

                  {/* 3-column sub-division grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {subDivisions.map(sub => {
                      const subMonthly = divMonthly.filter(p => p.sub_divisi === sub.id);
                      const subWeekly = divWeekly.filter(p => p.sub_divisi === sub.id);
                      const subSelesai = subWeekly.filter(p => p.status === 'selesai').length;
                      const subDalamPekerjaan = subWeekly.filter(p => p.status === 'dalam_pekerjaan').length;

                      return (
                        <div key={sub.id} className="flex flex-col">
                          {/* Sub-division header */}
                          <div className={cn("px-4 py-3 border-b",
                            div.color === 'blue' ? 'bg-blue-50/60 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/40' :
                              div.color === 'green' ? 'bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/40' : 'bg-amber-50/60 dark:bg-amber-900/10 border-amber-100 dark:border-amber-800/40'
                          )}>
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm">{sub.name}</h4>
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{subMonthly.length}P · {subWeekly.length}L</span>
                            </div>
                            <div className="flex gap-3 text-[10px] font-semibold">
                              <span className="text-emerald-600 dark:text-emerald-400">✓ {subSelesai} Selesai</span>
                              <span className="text-blue-600 dark:text-blue-400">▶ {subDalamPekerjaan} Berjalan</span>
                              <span className="text-slate-400">{subWeekly.filter(p => p.status === 'rencana').length} Menunggu</span>
                            </div>
                          </div>

                          {/* Program list */}
                          <div className="divide-y divide-slate-50 dark:divide-slate-800/60 flex-1">
                            {subMonthly.length === 0 && subWeekly.length === 0 ? (
                              <p className="px-4 py-5 text-xs text-slate-300 dark:text-slate-600 italic text-center">Belum ada program</p>
                            ) : subMonthly.map(prog => {
                              const progWeekly = subWeekly.filter(w => w.monthly_plan_id === prog.id);
                              const latestWeekly = progWeekly.length > 0 ? progWeekly[progWeekly.length - 1] : null;

                              return (
                                <div key={prog.id} className="px-4 py-3">
                                  {/* Program name */}
                                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug mb-1.5">{prog.program}</p>

                                  {progWeekly.length === 0 ? (
                                    <span className="text-[10px] text-slate-300 dark:text-slate-600 italic">Belum ada laporan mingguan</span>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {progWeekly.map(wp => (
                                        <div key={wp.id} className={cn("rounded-lg px-2.5 py-2 text-[10px] border",
                                          wp.status === 'selesai' ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/30' :
                                            wp.status === 'dalam_pekerjaan' ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/30' :
                                              wp.status === 'ditunda' ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800/30' : 'bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-700/30'
                                        )}>
                                          <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className={cn("font-bold uppercase tracking-wide",
                                              wp.status === 'selesai' ? 'text-emerald-700 dark:text-emerald-400' :
                                                wp.status === 'dalam_pekerjaan' ? 'text-blue-700 dark:text-blue-400' :
                                                  wp.status === 'ditunda' ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
                                            )}>{STATUS_OPTIONS.find(s => s.value === wp.status)?.label}</span>
                                            <span className="text-slate-400 dark:text-slate-500 font-medium shrink-0">{wp.tanggal_mulai}</span>
                                          </div>
                                          {wp.catatan && <p className="text-slate-600 dark:text-slate-400 line-clamp-1 mb-1">{wp.catatan}</p>}
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-slate-400 dark:text-slate-500 truncate">{wp.penanggung_jawab.slice(0, 2).join(', ')}{wp.penanggung_jawab.length > 2 ? ` +${wp.penanggung_jawab.length - 2}` : ''}</span>
                                            {wp.foto_urls && wp.foto_urls.length > 0 && (
                                              <div className="flex gap-1 shrink-0">
                                                {wp.foto_urls.slice(0, 2).map((url, i) => (
                                                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block w-7 h-7 rounded overflow-hidden border border-slate-200 dark:border-slate-600 hover:ring-1 hover:ring-blue-400 transition-all">
                                                    <img src={url} alt="" className="w-full h-full object-cover" />
                                                  </a>
                                                ))}
                                                {wp.foto_urls.length > 2 && (
                                                  <span className="flex items-center justify-center w-7 h-7 rounded bg-slate-100 dark:bg-slate-800 text-[9px] font-bold text-slate-500 border border-slate-200 dark:border-slate-700">+{wp.foto_urls.length - 2}</span>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {stats.totalMonthly === 0 && (
              <div className="glass-card rounded-3xl text-center py-16 text-slate-400 dark:text-slate-500">
                <svg className="w-16 h-16 mx-auto mb-4 text-slate-200 dark:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="font-semibold">Belum ada laporan untuk periode ini</p>
              </div>
            )}
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Divisi</label>
                  <div className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-slate-50/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold shadow-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400"></span>
                    {DIVISIONS.find(d => d.id === currentDivision)?.name || 'Perencanaan Teknik'}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Sub Divisi <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select
                      value={monthlyForm.sub_divisi || ''}
                      onChange={(e) => setMonthlyForm(prev => ({ ...prev, sub_divisi: e.target.value as SubDivision || undefined }))}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full appearance-none border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-4 py-3 focus:ring-4 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 focus:border-blue-500 dark:focus:border-blue-400 outline-none transition-all font-medium text-slate-800 dark:text-slate-100 cursor-pointer relative z-10"
                    >
                      <option value="">-- Pilih Sub Divisi --</option>
                      {(currentDivision && currentDivision !== 'direksi' ? SUB_DIVISIONS[currentDivision] : SUB_DIVISIONS['perencanaan_teknik']).map(sub => (
                        <option key={sub.id} value={sub.id} className="font-medium text-slate-800 dark:text-slate-200">{sub.name}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 dark:text-slate-400 z-20">
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
                disabled={!monthlyForm.program || !monthlyForm.sub_divisi}
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
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Status Mingguan</label>
                <div className="relative">
                  <select
                    value={weeklyForm.status}
                    onChange={(e) => setWeeklyForm(prev => ({ ...prev, status: e.target.value as Status }))}
                    className="w-full appearance-none border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 focus:ring-4 focus:ring-emerald-500/20 dark:focus:ring-emerald-400/20 focus:border-emerald-500 dark:focus:border-emerald-400 outline-none transition-all font-medium text-slate-700 dark:text-slate-300 [color-scheme:light] dark:[color-scheme:dark]"
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s.value} value={s.value} className="font-medium text-slate-800 dark:text-slate-200">{s.label}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 dark:text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Divisi</label>
                  <div className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-slate-50/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold shadow-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400"></span>
                    {DIVISIONS.find(d => d.id === currentDivision)?.name || 'Perencanaan Teknik'}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Sub Divisi (Opsional)</label>
                  <div className="relative">
                    <select
                      value={weeklyForm.sub_divisi || ''}
                      onChange={(e) => setWeeklyForm(prev => ({ ...prev, sub_divisi: e.target.value as SubDivision || undefined }))}
                      disabled
                      className="w-full appearance-none border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl px-4 py-3 focus:outline-none focus:ring-0 font-bold text-slate-500 dark:text-slate-400 opacity-80 cursor-not-allowed"
                    >
                      <option value="">-- Tanpa Sub Divisi --</option>
                      {(currentDivision && currentDivision !== 'direksi' ? SUB_DIVISIONS[currentDivision] : SUB_DIVISIONS['perencanaan_teknik']).map(sub => (
                        <option key={sub.id} value={sub.id}>{sub.name}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 dark:text-slate-500 opacity-50">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
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
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Catatan / Deskripsi (Opsional)</label>
                <textarea
                  value={weeklyForm.catatan}
                  onChange={(e) => setWeeklyForm(prev => ({ ...prev, catatan: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 focus:ring-4 focus:ring-emerald-500/20 dark:focus:ring-emerald-400/20 focus:border-emerald-500 dark:focus:border-emerald-400 outline-none transition-all font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 min-h-[80px]"
                  placeholder="Keterangan tambahan atau rincian pekerjaan..."
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
