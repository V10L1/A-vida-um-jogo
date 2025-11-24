import React, { useState, useEffect } from 'react';
import { UserProfile, GameState, ActivityLog, ACTIVITIES, ActivityType } from './types';
import { getIcon } from './components/Icons';
import { generateRpgFlavorText, generateClassTitle } from './services/geminiService';
import { auth, loginWithGoogle, logoutUser, saveUserDataToCloud, loadUserDataFromCloud, checkRedirectResult } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

// --- Helper Components ---

const ProgressBar = ({ current, max, color = "bg-blue-500" }: { current: number; max: number; color?: string }) => {
  const percentage = Math.min(100, Math.max(0, (current / max) * 100));
  return (
    <div className="w-full bg-slate-950 rounded-full h-4 overflow-hidden border border-slate-800 shadow-inner">
      <div
        className={`h-full ${color} transition-all duration-1000 ease-out flex items-center justify-end pr-1`}
        style={{ width: `${percentage}%` }}
      >
        <div className="w-full h-full bg-white/20 animate-pulse"></div>
      </div>
    </div>
  );
};

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children?: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in-up">
        <div className="bg-slate-800 p-4 flex justify-between items-center border-b border-slate-700">
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">✕</button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  // State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    level: 1,
    currentXp: 0,
    totalXp: 0,
    logs: [],
    classTitle: "Novato",
    activeBuff: null
  });
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isSleepModalOpen, setIsSleepModalOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityType | null>(null);
  const [inputAmount, setInputAmount] = useState('');
  
  // Sleep Inputs
  const [bedTime, setBedTime] = useState('22:00');
  const [wakeTime, setWakeTime] = useState('06:00');

  const [narratorText, setNarratorText] = useState<string>("Bem-vindo ao LifeRPG. Comece sua jornada!");
  const [loadingAi, setLoadingAi] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  
  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Constants
  const XP_FOR_NEXT_LEVEL_BASE = 100;
  
  // Initialize & Auth Listener
  useEffect(() => {
    // 1. Carregar local primeiro para ser rápido
    const savedUser = localStorage.getItem('liferpg_user');
    const savedGame = localStorage.getItem('liferpg_game');
    
    if (savedUser) setUser(JSON.parse(savedUser));
    if (savedGame) {
        // Garantir retrocompatibilidade com saves antigos sem activeBuff
        const parsedGame = JSON.parse(savedGame);
        setGameState(prev => ({ ...prev, ...parsedGame }));
    }

    // 2. Checar resultado de login via redirect
    const checkLoginErrors = async () => {
        try {
            await checkRedirectResult();
        } catch (error: any) {
            console.error("Erro no retorno do login:", error);
            let errorMessage = "Erro desconhecido ao conectar.";
            
            if (error.code === 'auth/unauthorized-domain') {
                errorMessage = `DOMÍNIO BLOQUEADO PELO FIREBASE:\n\nO endereço "${window.location.hostname}" não está na lista de permitidos.\n\nVá no Firebase Console > Authentication > Settings > Authorized Domains e adicione: ${window.location.hostname}`;
            } else if (error.code === 'auth/api-key-not-valid-please-pass-a-valid-api-key') {
                errorMessage = "Chave de API do Firebase inválida ou expirada. Verifique as variáveis na Vercel.";
            } else if (error.message) {
                errorMessage = error.message;
            }
            alert(errorMessage);
        }
    };
    checkLoginErrors();

    // 3. Configurar listener do Firebase
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        setCurrentUser(firebaseUser);
        if (firebaseUser) {
          setIsSyncing(true);
          const cloudData = await loadUserDataFromCloud(firebaseUser.uid);
          if (cloudData) {
            setUser(cloudData.userProfile);
            setGameState(prev => ({ ...prev, ...cloudData.gameState })); // Merge para garantir campos novos
            setNarratorText("Sincronização completa. Bem-vindo de volta, herói!");
          } else {
            if (savedUser && savedGame) {
              await saveUserDataToCloud(firebaseUser.uid, JSON.parse(savedUser), JSON.parse(savedGame));
            }
          }
          setIsSyncing(false);
        }
      });
      return () => unsubscribe();
    }
  }, []);

  // Save Effect (Local + Cloud)
  useEffect(() => {
    if (user) {
      localStorage.setItem('liferpg_user', JSON.stringify(user));
      if (currentUser && gameState) {
        saveUserDataToCloud(currentUser.uid, user, gameState);
      }
    }
  }, [user]);

  useEffect(() => {
    if (gameState) {
      localStorage.setItem('liferpg_game', JSON.stringify(gameState));
      if (currentUser && user) {
         saveUserDataToCloud(currentUser.uid, user, gameState);
      }
    }
  }, [gameState]);


  // Logic
  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (e: any) {
      console.error(e);
      if (e.code === 'auth/unauthorized-domain') {
        alert(`DOMÍNIO BLOQUEADO:\n\nAdicione "${window.location.hostname}" no Firebase Console > Authentication > Settings > Authorized Domains.`);
      } else {
        alert("Erro ao iniciar login: " + e.message);
      }
    }
  };

  const handleLogout = async () => {
    await logoutUser();
  };

  const calculateXpForNextLevel = (level: number) => {
    return level * XP_FOR_NEXT_LEVEL_BASE;
  };

  const handleOnboarding = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newUser: UserProfile = {
      name: formData.get('name') as string,
      dob: formData.get('dob') as string,
      weight: Number(formData.get('weight')),
      height: Number(formData.get('height')),
    };
    setUser(newUser);
    updateNarrator(newUser, gameState, undefined, true);
  };

  const updateNarrator = async (u: UserProfile, g: GameState, activityName?: string, isInit = false) => {
    setLoadingAi(true);
    try {
      if (isInit) {
          setNarratorText(`Bem-vindo, ${u.name}. Sua aventura começa agora.`);
      } else {
          const text = await generateRpgFlavorText(u, g, activityName);
          setNarratorText(text);
          
          if (Math.random() > 0.7 || showLevelUp) {
             const title = await generateClassTitle(g);
             setGameState(prev => ({...prev, classTitle: title}));
          }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAi(false);
    }
  };

  const handleLogActivity = () => {
    if (!selectedActivity || !inputAmount || isNaN(Number(inputAmount))) return;

    const amount = Number(inputAmount);
    
    // Calcular XP base
    let xpGained = Math.floor(amount * selectedActivity.xpPerUnit);

    // Aplicar Buff se ativo
    let buffApplied = false;
    if (gameState.activeBuff) {
        const now = Date.now();
        if (now < gameState.activeBuff.expiresAt) {
            xpGained = Math.floor(xpGained * gameState.activeBuff.multiplier);
            buffApplied = true;
        } else {
            // Buff expirou, limpar silenciosamente
            // (Será limpo no próximo setGameState)
        }
    }
    
    const newLog: ActivityLog = {
      id: Date.now().toString(),
      activityId: selectedActivity.id,
      amount,
      xpGained,
      timestamp: Date.now(),
    };

    let newCurrentXp = gameState.currentXp + xpGained;
    let newTotalXp = gameState.totalXp + xpGained;
    let newLevel = gameState.level;
    let leveledUp = false;

    let xpNeeded = calculateXpForNextLevel(newLevel);
    while (newCurrentXp >= xpNeeded) {
      newCurrentXp -= xpNeeded;
      newLevel++;
      xpNeeded = calculateXpForNextLevel(newLevel);
      leveledUp = true;
    }

    // Remover buff se expirado
    const activeBuff = (gameState.activeBuff && Date.now() < gameState.activeBuff.expiresAt) 
        ? gameState.activeBuff 
        : null;

    const newState = {
      ...gameState,
      level: newLevel,
      currentXp: newCurrentXp,
      totalXp: newTotalXp,
      logs: [newLog, ...gameState.logs].slice(0, 50),
      activeBuff: activeBuff
    };

    setGameState(newState);
    setIsActivityModalOpen(false);
    setInputAmount('');
    setSelectedActivity(null);
    
    if (leveledUp) {
      setShowLevelUp(true);
      setTimeout(() => setShowLevelUp(false), 5000);
      updateNarrator(user!, newState, "LEVEL UP");
    } else {
      updateNarrator(user!, newState, selectedActivity.label + (buffApplied ? " (Buffado)" : ""));
    }
  };

  const handleRegisterSleep = () => {
    // 1. Calcular horas dormidas
    const [bedH, bedM] = bedTime.split(':').map(Number);
    const [wakeH, wakeM] = wakeTime.split(':').map(Number);
    
    let sleepDuration = 0;
    
    // Normalizar para minutos do dia (0 a 1440)
    const bedMinutes = bedH * 60 + bedM;
    const wakeMinutes = wakeH * 60 + wakeM;
    
    if (wakeMinutes >= bedMinutes) {
        // Dormiu e acordou no mesmo dia (ex: soneca)
        sleepDuration = (wakeMinutes - bedMinutes) / 60;
    } else {
        // Virou a noite
        sleepDuration = ((1440 - bedMinutes) + wakeMinutes) / 60;
    }

    if (sleepDuration <= 0) {
        alert("Horários inválidos.");
        return;
    }

    // 2. Calcular Buff
    // Regra: 2% por hora até 9h. Após 9h, reduz 2% por hora excedida.
    let percentage = 0;
    if (sleepDuration <= 9) {
        percentage = sleepDuration * 2;
    } else {
        const base = 9 * 2; // 18%
        const excess = sleepDuration - 9;
        const penalty = excess * 2;
        percentage = Math.max(0, base - penalty);
    }
    
    const multiplier = 1 + (percentage / 100);

    // 3. Definir validade (Até o horário de dormir HOJE)
    const now = new Date();
    const expireDate = new Date();
    expireDate.setHours(bedH, bedM, 0, 0);

    // Se o horário de expiração já passou hoje (ex: registrou sono às 23h, e bedTime é 22h),
    // assume-se que é para amanhã.
    // Mas a lógica do prompt diz "até as 22h daquele dia" (dia do registro).
    // Se eu registrar as 08:00 da manhã que fui dormir as 22:00, o buff dura até hoje as 22:00.
    if (expireDate.getTime() < now.getTime()) {
        // Se já passou, talvez o usuário esteja registrando atrasado ou o "bedTime" é muito cedo.
        // Vamos garantir que seja no futuro próximo (hoje a noite)
        if (now.getHours() > bedH) {
             // Se agora é 23h e bedTime é 22h, o buff já expirou se fosse hoje.
             // Nesse caso, o buff dura até amanhã às 22h? 
             // Pela lógica do "ciclo diário", faz sentido durar até o próximo ciclo.
             expireDate.setDate(expireDate.getDate() + 1);
        }
    }

    const newBuff = {
        multiplier: Number(multiplier.toFixed(2)),
        expiresAt: expireDate.getTime(),
        description: `Buff de Sono: +${percentage.toFixed(0)}% XP`
    };

    setGameState(prev => ({
        ...prev,
        activeBuff: newBuff
    }));

    setIsSleepModalOpen(false);
    setNarratorText(`Sono registrado! Você ganhou um bônus de ${percentage.toFixed(0)}% de XP até as ${bedTime}.`);
  };

  // Check active buff validity for UI
  const isBuffActive = gameState.activeBuff && Date.now() < gameState.activeBuff.expiresAt;
  const buffPercentage = isBuffActive ? Math.round((gameState.activeBuff!.multiplier - 1) * 100) : 0;

  // --- Views ---

  if (!user) {
     // ... (Mantendo código de onboarding igual)
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
              LifeRPG
            </h1>
            <p className="mt-2 text-slate-400">Crie seu personagem</p>
          </div>
          <form onSubmit={handleOnboarding} className="bg-slate-900/50 p-8 rounded-2xl shadow-xl border border-slate-800 space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-200">Nome do Herói</label>
              <input name="name" required className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: Aragorn" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-200">Data de Nascimento</label>
              <input type="date" name="dob" required className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-200">Peso (kg)</label>
                <input type="number" name="weight" step="0.1" required className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200">Altura (cm)</label>
                <input type="number" name="height" required className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
            <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/20">
              Iniciar Aventura
            </button>
          </form>
           <div className="text-center pt-4">
              <p className="text-slate-500 text-sm mb-2">Já tem uma conta?</p>
              <button 
                onClick={handleGoogleLogin}
                className="text-blue-400 hover:text-blue-300 text-sm font-semibold flex items-center justify-center gap-2 w-full"
              >
                {getIcon("User", "w-4 h-4")}
                Recuperar Progresso com Google
              </button>
           </div>
        </div>
      </div>
    );
  }

  const xpNeeded = calculateXpForNextLevel(gameState.level);

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24 md:pb-6 relative overflow-hidden">
      
      {/* Level Up Overlay */}
      {showLevelUp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md animate-fade-in">
          <div className="text-center transform scale-125 animate-bounce-slow">
            <h2 className="text-6xl font-black text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]">LEVEL UP!</h2>
            <p className="text-2xl mt-4 text-white font-bold">Você alcançou o Nível {gameState.level}</p>
          </div>
        </div>
      )}

      {/* Header Profile Card */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-xl shadow-lg border-2 border-slate-700 relative">
                {user.name.charAt(0).toUpperCase()}
                {isBuffActive && (
                    <div className="absolute -bottom-1 -right-1 bg-purple-600 border border-slate-900 rounded-full p-1 w-5 h-5 flex items-center justify-center" title="Buff Ativo">
                        {getIcon("Zap", "w-3 h-3 text-white")}
                    </div>
                )}
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight flex items-center gap-2">
                    {user.name}
                </h1>
                <p className="text-xs text-blue-400 font-medium tracking-wider uppercase">{gameState.classTitle}</p>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-1">
               {currentUser ? (
                  <button 
                    onClick={handleLogout}
                    className="text-[10px] bg-emerald-900/50 text-emerald-400 border border-emerald-800 px-2 py-1 rounded flex items-center gap-1 hover:bg-emerald-900 transition-colors"
                  >
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    Salvo
                  </button>
               ) : (
                  <button 
                    onClick={handleGoogleLogin}
                    className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-1 rounded flex items-center gap-1 hover:text-white hover:border-slate-500 transition-colors"
                  >
                    ☁️ Salvar
                  </button>
               )}
               
               <div className="text-right">
                <div className="text-3xl font-black text-yellow-400 drop-shadow-sm leading-none">{gameState.level}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">Nível</div>
               </div>
            </div>
          </div>
          
          <div className="relative pt-1">
            <div className="flex mb-2 items-center justify-between">
              <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-100 bg-slate-800 border border-slate-700">
                XP {gameState.currentXp} / {xpNeeded}
              </span>
              {isBuffActive && (
                  <span className="text-xs font-bold text-purple-400 animate-pulse flex items-center gap-1">
                      {getIcon("Clock", "w-3 h-3")} +{buffPercentage}% XP (até {new Date(gameState.activeBuff!.expiresAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})})
                  </span>
              )}
              {!isBuffActive && (
                 <span className="text-xs font-semibold text-blue-200">
                    {Math.round((gameState.currentXp / xpNeeded) * 100)}%
                 </span>
              )}
            </div>
            <ProgressBar current={gameState.currentXp} max={xpNeeded} color="bg-gradient-to-r from-blue-500 to-indigo-400" />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-2xl mx-auto p-4 space-y-6">
        
        {/* Narrator Box */}
        <div className="bg-slate-800/40 border border-slate-700 p-4 rounded-xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
          <div className="flex gap-3">
             <div className="mt-1 min-w-[24px]">
               {getIcon("Brain", "w-6 h-6 text-blue-400")}
             </div>
             <div>
               <p className="text-sm text-slate-100 italic leading-relaxed">
                 "{narratorText}"
               </p>
               {loadingAi && <span className="text-xs text-blue-500 animate-pulse mt-1 block">O Mestre está pensando...</span>}
             </div>
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div>
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            {getIcon("Activity", "w-4 h-4")}
            Registrar Atividade
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {ACTIVITIES.map((act) => (
              <button
                key={act.id}
                onClick={() => {
                  setSelectedActivity(act);
                  setIsActivityModalOpen(true);
                }}
                className="flex flex-col items-center justify-center p-4 bg-slate-800/60 hover:bg-slate-700 border border-slate-700 hover:border-blue-500/50 rounded-xl transition-all active:scale-95 group"
              >
                <div className="mb-2 p-3 rounded-full bg-slate-900 group-hover:bg-slate-800 text-blue-400 group-hover:text-blue-300 transition-colors">
                  {getIcon(act.icon)}
                </div>
                <span className="font-semibold text-sm">{act.label}</span>
                <span className="text-xs text-slate-400">+{isBuffActive ? Math.floor(act.xpPerUnit * gameState.activeBuff!.multiplier) : act.xpPerUnit} XP</span>
              </button>
            ))}
            
            {/* Sleep Button (Special) */}
             <button
                onClick={() => setIsSleepModalOpen(true)}
                className="flex flex-col items-center justify-center p-4 bg-indigo-900/30 hover:bg-indigo-900/50 border border-indigo-800 hover:border-indigo-500/50 rounded-xl transition-all active:scale-95 group"
              >
                <div className="mb-2 p-3 rounded-full bg-slate-900 group-hover:bg-slate-800 text-indigo-400 group-hover:text-indigo-300 transition-colors">
                  {getIcon("Moon")}
                </div>
                <span className="font-semibold text-sm text-indigo-200">Registrar Sono</span>
                <span className="text-xs text-indigo-400/70">Buff de XP</span>
              </button>
          </div>
        </div>

        {/* Recent Logs */}
        <div>
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Histórico de Missões</h2>
          <div className="space-y-2">
            {gameState.logs.length === 0 ? (
              <div className="text-center py-8 text-slate-500/50 text-sm italic">
                Nenhuma atividade registrada hoje. A aventura aguarda!
              </div>
            ) : (
              gameState.logs.map((log) => {
                const activity = ACTIVITIES.find(a => a.id === log.activityId);
                return (
                  <div key={log.id} className="bg-slate-800/40 border border-slate-700 rounded-lg p-3 flex items-center justify-between hover:bg-slate-800/80 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-900 rounded-full text-slate-400">
                        {getIcon(activity?.icon || 'Activity', 'w-4 h-4')}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{activity?.label}</div>
                        <div className="text-xs text-slate-400/70">{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • {log.amount} {activity?.unit}</div>
                      </div>
                    </div>
                    <div className="text-blue-400 font-bold text-sm">+{log.xpGained} XP</div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </main>

      {/* Add Activity Modal */}
      <Modal
        isOpen={isActivityModalOpen}
        onClose={() => setIsActivityModalOpen(false)}
        title={selectedActivity?.label || 'Registrar'}
      >
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-block p-4 bg-slate-950 rounded-full text-blue-400 mb-2">
              {selectedActivity && getIcon(selectedActivity.icon, "w-8 h-8")}
            </div>
            <p className="text-slate-300 text-sm">
              Quanto você realizou? <br/>
              <span className="text-blue-400 text-xs">
                 Base: {selectedActivity?.xpPerUnit} XP
                 {isBuffActive && <span className="text-purple-400 ml-1">x {gameState.activeBuff?.multiplier} (Buff)</span>}
              </span>
            </p>
          </div>

          <div>
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quantidade ({selectedActivity?.unit})</label>
             <input
               type="number"
               value={inputAmount}
               onChange={(e) => setInputAmount(e.target.value)}
               className="w-full bg-slate-950 border border-slate-700 rounded-lg p-4 text-2xl text-center text-white focus:ring-2 focus:ring-blue-500 outline-none"
               placeholder="0"
               autoFocus
             />
          </div>

          <div className="pt-2">
             <button 
                onClick={handleLogActivity}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
             >
                {getIcon("Plus", "w-5 h-5")}
                Confirmar Missão
             </button>
          </div>
        </div>
      </Modal>

      {/* Sleep Modal */}
      <Modal
        isOpen={isSleepModalOpen}
        onClose={() => setIsSleepModalOpen(false)}
        title="Descanso do Guerreiro"
      >
        <div className="space-y-6">
           <div className="bg-indigo-900/20 border border-indigo-800 rounded-lg p-4 text-sm text-indigo-200">
              <p>O sono restaura suas energias. Ganhe <strong>+2% XP</strong> por hora dormida (máx 9h). Horas extras causam fadiga (-2% XP).</p>
           </div>
           
           <div className="grid grid-cols-2 gap-4">
              <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fui dormir às</label>
                  <input 
                    type="time" 
                    value={bedTime}
                    onChange={(e) => setBedTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
              </div>
              <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Acordei às</label>
                  <input 
                    type="time" 
                    value={wakeTime}
                    onChange={(e) => setWakeTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
              </div>
           </div>

           <button 
                onClick={handleRegisterSleep}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20"
             >
                {getIcon("Moon", "w-5 h-5")}
                Dormir e Restaurar
             </button>
        </div>
      </Modal>

    </div>
  );
}