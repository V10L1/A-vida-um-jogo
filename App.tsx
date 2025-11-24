import React, { useState, useEffect } from 'react';
import { UserProfile, GameState, ActivityLog, ACTIVITIES, ActivityType } from './types';
import { getIcon } from './components/Icons';
import { generateRpgFlavorText, generateClassTitle } from './services/geminiService';
import { auth, loginWithGoogle, logoutUser, saveUserDataToCloud, loadUserDataFromCloud } from './firebase';
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
    classTitle: "Novato"
  });
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityType | null>(null);
  const [inputAmount, setInputAmount] = useState('');
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
    if (savedGame) setGameState(JSON.parse(savedGame));

    // 2. Configurar listener do Firebase
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        setCurrentUser(firebaseUser);
        if (firebaseUser) {
          // Se logou, tenta baixar dados da nuvem
          setIsSyncing(true);
          const cloudData = await loadUserDataFromCloud(firebaseUser.uid);
          if (cloudData) {
            // Se tem dados na nuvem, usa eles (Prioridade para Nuvem)
            setUser(cloudData.userProfile);
            setGameState(cloudData.gameState);
            setNarratorText("Sincronização completa. Bem-vindo de volta, herói!");
          } else {
            // Se não tem dados na nuvem, mas tem local, sobe os dados locais
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
      // Save to cloud if logged in
      if (currentUser && gameState) {
        saveUserDataToCloud(currentUser.uid, user, gameState);
      }
    }
  }, [user]);

  useEffect(() => {
    if (gameState) {
      localStorage.setItem('liferpg_game', JSON.stringify(gameState));
      // Save to cloud if logged in
      if (currentUser && user) {
         saveUserDataToCloud(currentUser.uid, user, gameState);
      }
    }
  }, [gameState]);


  // Logic
  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (e) {
      alert("Erro ao conectar com Google");
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    // Opcional: Limpar dados locais ao sair?
    // setUser(null); 
    // setGameState(...);
    // Por enquanto, mantemos os dados locais para permitir uso offline
  };

  const calculateXpForNextLevel = (level: number) => {
    // Linear scaling: Level 1 needs 100, Level 2 needs 200, etc.
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
    // Initial flavor text
    updateNarrator(newUser, gameState, undefined, true);
  };

  const updateNarrator = async (u: UserProfile, g: GameState, activityName?: string, isInit = false) => {
    setLoadingAi(true);
    try {
      if (isInit) {
          // Just a greeting
          setNarratorText(`Bem-vindo, ${u.name}. Sua aventura começa agora.`);
      } else {
          const text = await generateRpgFlavorText(u, g, activityName);
          setNarratorText(text);
          
          // Update class title occasionally
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
    const xpGained = Math.floor(amount * selectedActivity.xpPerUnit);
    
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

    // Level up logic
    let xpNeeded = calculateXpForNextLevel(newLevel);
    while (newCurrentXp >= xpNeeded) {
      newCurrentXp -= xpNeeded;
      newLevel++;
      xpNeeded = calculateXpForNextLevel(newLevel);
      leveledUp = true;
    }

    const newState = {
      ...gameState,
      level: newLevel,
      currentXp: newCurrentXp,
      totalXp: newTotalXp,
      logs: [newLog, ...gameState.logs].slice(0, 50), // keep last 50
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
      updateNarrator(user!, newState, selectedActivity.label);
    }
  };

  // --- Views ---

  if (!user) {
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
          {/* Login option for restoration */}
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
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-xl shadow-lg border-2 border-slate-700">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight">{user.name}</h1>
                <p className="text-xs text-blue-400 font-medium tracking-wider uppercase">{gameState.classTitle}</p>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-1">
               {/* Cloud Save Button */}
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
              <span className="text-xs font-semibold text-blue-200">
                {Math.round((gameState.currentXp / xpNeeded) * 100)}%
              </span>
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
               {isSyncing && <span className="text-xs text-emerald-500 mt-1 block">Sincronizando com os arquivos sagrados...</span>}
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
                <span className="text-xs text-slate-400">+{act.xpPerUnit} XP</span>
              </button>
            ))}
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
              <span className="text-blue-400 text-xs">Recompensa: {selectedActivity?.xpPerUnit} XP por {selectedActivity?.unit}</span>
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

    </div>
  );
}