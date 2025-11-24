import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, GameState, ActivityLog, ACTIVITIES, ActivityType, Gender, RPG_CLASSES } from './types';
import { getIcon } from './components/Icons';
import { generateRpgFlavorText } from './services/geminiService';
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

const Modal = ({ isOpen, onClose, title, children, large = false }: { isOpen: boolean; onClose: () => void; title: string; children?: React.ReactNode; large?: boolean }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-slate-900 border border-slate-700 rounded-xl w-full ${large ? 'max-w-2xl' : 'max-w-md'} shadow-2xl overflow-hidden animate-fade-in-up max-h-[90vh] overflow-y-auto`}>
        <div className="bg-slate-800 p-4 flex justify-between items-center border-b border-slate-700 sticky top-0 z-10">
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

// --- Radar Chart Component ---
const RadarChart = ({ classPoints }: { classPoints: Record<string, number> }) => {
  const size = 300;
  const center = size / 2;
  const radius = (size / 2) - 40; // Padding
  const classes = RPG_CLASSES;
  
  // Encontrar o valor máximo para normalizar o gráfico (mínimo de 10 para não ficar zerado)
  const maxVal = Math.max(10, ...Object.values(classPoints));

  // Helper para calcular coordenadas
  const getCoordinates = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / classes.length - Math.PI / 2;
    const r = (value / maxVal) * radius;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y };
  };

  // Gerar o caminho do polígono (seus pontos)
  const points = classes.map((cls, i) => {
    const val = classPoints[cls] || 0;
    const { x, y } = getCoordinates(i, val);
    return `${x},${y}`;
  }).join(" ");

  // Gerar o polígono de fundo (limite máximo)
  const backgroundPoints = classes.map((_, i) => {
    const { x, y } = getCoordinates(i, maxVal);
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="relative flex justify-center py-4">
      <svg width={size} height={size} className="overflow-visible">
        {/* Fundo do Radar (Teia) */}
        <polygon points={backgroundPoints} fill="rgba(30, 41, 59, 0.5)" stroke="#334155" strokeWidth="1" />
        {[0.25, 0.5, 0.75].map((scale) => (
             <polygon 
                key={scale}
                points={classes.map((_, i) => {
                    const { x, y } = getCoordinates(i, maxVal * scale);
                    return `${x},${y}`;
                }).join(" ")}
                fill="none" 
                stroke="#334155" 
                strokeWidth="1" 
                strokeDasharray="4 4"
             />
        ))}

        {/* Dados do Jogador */}
        <polygon points={points} fill="rgba(59, 130, 246, 0.4)" stroke="#3b82f6" strokeWidth="2" />
        
        {/* Círculos nos vértices */}
        {classes.map((cls, i) => {
            const val = classPoints[cls] || 0;
            const { x, y } = getCoordinates(i, val);
            return <circle key={i} cx={x} cy={y} r="3" fill="#60a5fa" />;
        })}

        {/* Labels */}
        {classes.map((cls, i) => {
          const { x, y } = getCoordinates(i, maxVal + (maxVal * 0.15)); // Um pouco pra fora do raio
          return (
            <text 
              key={i} 
              x={x} 
              y={y} 
              textAnchor="middle" 
              dominantBaseline="middle" 
              className="text-[10px] fill-slate-400 font-bold uppercase"
              style={{ fontSize: '9px' }}
            >
              {cls}
            </text>
          );
        })}
      </svg>
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
    classTitle: "NPC",
    classPoints: {}, 
    activeBuff: null
  });
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isSleepModalOpen, setIsSleepModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false); // Estado para edição de perfil

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
    const savedUser = localStorage.getItem('liferpg_user');
    const savedGame = localStorage.getItem('liferpg_game');
    
    if (savedUser) setUser(JSON.parse(savedUser));
    if (savedGame) {
        const parsedGame = JSON.parse(savedGame);
        setGameState(prev => ({ 
            ...prev, 
            ...parsedGame,
            classTitle: parsedGame.classTitle || "NPC",
            classPoints: parsedGame.classPoints || {} 
        }));
    }

    const checkLoginErrors = async () => {
        try {
            await checkRedirectResult();
        } catch (error: any) {
            console.error("Erro no retorno do login:", error);
            let errorMessage = "Erro desconhecido ao conectar.";
            if (error.code === 'auth/unauthorized-domain') {
                errorMessage = `DOMÍNIO BLOQUEADO PELO FIREBASE:\n\nO endereço "${window.location.hostname}" não está na lista de permitidos.`;
            }
            alert(errorMessage);
        }
    };
    checkLoginErrors();

    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        setCurrentUser(firebaseUser);
        if (firebaseUser) {
          setIsSyncing(true);
          const cloudData = await loadUserDataFromCloud(firebaseUser.uid);
          if (cloudData) {
            setUser(cloudData.userProfile);
            setGameState(prev => ({ ...prev, ...cloudData.gameState })); 
            setNarratorText("Sincronização completa. Bem-vindo de volta, herói!");
          } else if (savedUser && savedGame) {
              await saveUserDataToCloud(firebaseUser.uid, JSON.parse(savedUser), JSON.parse(savedGame));
          }
          setIsSyncing(false);
        }
      });
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem('liferpg_user', JSON.stringify(user));
      if (currentUser && gameState) saveUserDataToCloud(currentUser.uid, user, gameState);
    }
  }, [user]);

  useEffect(() => {
    if (gameState) {
      localStorage.setItem('liferpg_game', JSON.stringify(gameState));
      if (currentUser && user) saveUserDataToCloud(currentUser.uid, user, gameState);
    }
  }, [gameState]);


  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (e: any) {
      alert("Erro ao iniciar login: " + e.message);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
  };

  const calculateXpForNextLevel = (level: number) => {
    return level * XP_FOR_NEXT_LEVEL_BASE;
  };

  const determineClass = (points: Record<string, number>): string => {
      let maxPoints = 0;
      let dominantClass = "NPC";
      for (const [className, score] of Object.entries(points)) {
          if (score > maxPoints) {
              maxPoints = score;
              dominantClass = className;
          }
      }
      if (maxPoints === 0) return "NPC";
      return dominantClass;
  };

  const handleOnboarding = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newUser: UserProfile = {
      name: formData.get('name') as string,
      dob: formData.get('dob') as string,
      weight: Number(formData.get('weight')),
      height: Number(formData.get('height')),
      gender: formData.get('gender') as Gender,
      profession: formData.get('profession') as string
    };
    setUser(newUser);
    updateNarrator(newUser, gameState, undefined, true);
  };

  const handleUpdateProfile = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    
    const updatedUser: UserProfile = {
        ...user,
        weight: Number(formData.get('weight')),
        height: Number(formData.get('height')),
        gender: formData.get('gender') as Gender,
        profession: formData.get('profession') as string
    };
    
    setUser(updatedUser);
    setIsEditingProfile(false);
    setNarratorText(`Perfil atualizado! Você parece diferente, ${updatedUser.name}.`);
  };

  const updateNarrator = async (u: UserProfile, g: GameState, activityName?: string, isInit = false) => {
    setLoadingAi(true);
    try {
      if (isInit) {
          setNarratorText(`Bem-vindo, ${u.name}. Sua vida como ${u.profession} ficou para trás. Agora você é um ${g.classTitle}!`);
      } else {
          const text = await generateRpgFlavorText(u, g, activityName);
          setNarratorText(text);
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
    let xpGained = Math.floor(amount * selectedActivity.xpPerUnit);

    let buffApplied = false;
    if (gameState.activeBuff) {
        const now = Date.now();
        if (now < gameState.activeBuff.expiresAt) {
            xpGained = Math.floor(xpGained * gameState.activeBuff.multiplier);
            buffApplied = true;
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

    // --- Atualizar Pontos de Classe ---
    const newClassPoints = { ...gameState.classPoints };
    if (selectedActivity.relatedClass) {
        // Agora dá 1 ponto por unidade realizada. Ex: 1km = 1 ponto de corredor.
        const pointsEarned = Math.ceil(amount);
        const currentClassScore = newClassPoints[selectedActivity.relatedClass] || 0;
        newClassPoints[selectedActivity.relatedClass] = currentClassScore + pointsEarned;
    }

    const newClassTitle = determineClass(newClassPoints);

    const activeBuff = (gameState.activeBuff && Date.now() < gameState.activeBuff.expiresAt) 
        ? gameState.activeBuff 
        : null;

    const newState = {
      ...gameState,
      level: newLevel,
      currentXp: newCurrentXp,
      totalXp: newTotalXp,
      logs: [newLog, ...gameState.logs].slice(0, 50),
      classPoints: newClassPoints,
      classTitle: newClassTitle,
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
    const [bedH, bedM] = bedTime.split(':').map(Number);
    const [wakeH, wakeM] = wakeTime.split(':').map(Number);
    let sleepDuration = 0;
    const bedMinutes = bedH * 60 + bedM;
    const wakeMinutes = wakeH * 60 + wakeM;
    
    if (wakeMinutes >= bedMinutes) {
        sleepDuration = (wakeMinutes - bedMinutes) / 60;
    } else {
        sleepDuration = ((1440 - bedMinutes) + wakeMinutes) / 60;
    }

    if (sleepDuration <= 0) {
        alert("Horários inválidos.");
        return;
    }

    let percentage = 0;
    if (sleepDuration <= 9) {
        percentage = sleepDuration * 2;
    } else {
        const base = 9 * 2;
        const excess = sleepDuration - 9;
        const penalty = excess * 2;
        percentage = Math.max(0, base - penalty);
    }
    
    const multiplier = 1 + (percentage / 100);
    const now = new Date();
    const expireDate = new Date();
    expireDate.setHours(bedH, bedM, 0, 0);

    if (expireDate.getTime() < now.getTime()) {
        if (now.getHours() > bedH) expireDate.setDate(expireDate.getDate() + 1);
    }

    setGameState(prev => ({
        ...prev,
        activeBuff: {
            multiplier: Number(multiplier.toFixed(2)),
            expiresAt: expireDate.getTime(),
            description: `Buff de Sono: +${percentage.toFixed(0)}% XP`
        }
    }));

    setIsSleepModalOpen(false);
    setNarratorText(`Sono registrado! Bônus de ${percentage.toFixed(0)}% de XP ativo.`);
  };

  const getAvatarUrl = useMemo(() => {
    if (!user) return '';
    const seed = user.name.replace(/\s/g, '');
    let style = 'micah'; // Estilo padrão bonito
    if (user.gender === 'Masculino') {
        return `https://api.dicebear.com/9.x/micah/svg?seed=${seed}&baseColor=f9c9b6&hair=fondue,fonze&mouth=laughing,smile`;
    } else if (user.gender === 'Feminino') {
        return `https://api.dicebear.com/9.x/micah/svg?seed=${seed}&baseColor=f9c9b6&hair=danny,pixie&mouth=laughing,smile`;
    } else {
        return `https://api.dicebear.com/9.x/bottts/svg?seed=${seed}`;
    }
  }, [user]);

  const isBuffActive = gameState.activeBuff && Date.now() < gameState.activeBuff.expiresAt;
  const buffPercentage = isBuffActive ? Math.round((gameState.activeBuff!.multiplier - 1) * 100) : 0;
  const xpNeeded = calculateXpForNextLevel(gameState.level);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">LifeRPG</h1>
            <p className="mt-2 text-slate-400">Crie seu personagem</p>
          </div>
          <form onSubmit={handleOnboarding} className="bg-slate-900/50 p-6 rounded-2xl shadow-xl border border-slate-800 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nome do Herói</label>
              <input name="name" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: Aragorn" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Gênero</label>
                  <select name="gender" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Data Nasc.</label>
                  <input type="date" name="dob" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Profissão (Vida Real)</label>
              <input name="profession" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: Programador..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Peso (kg)</label>
                <input type="number" name="weight" step="0.1" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Altura (cm)</label>
                <input type="number" name="height" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
            <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/20">Iniciar Aventura</button>
          </form>
           <div className="text-center pt-4">
              <button onClick={handleGoogleLogin} className="text-blue-400 hover:text-blue-300 text-sm font-semibold flex items-center justify-center gap-2 w-full">{getIcon("User", "w-4 h-4")} Recuperar com Google</button>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24 md:pb-6 relative overflow-hidden">
      
      {showLevelUp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md animate-fade-in">
          <div className="text-center transform scale-125 animate-bounce-slow">
            <h2 className="text-6xl font-black text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]">LEVEL UP!</h2>
            <p className="text-2xl mt-4 text-white font-bold">Você alcançou o Nível {gameState.level}</p>
          </div>
        </div>
      )}

      {/* Header Profile Card (Clickable) */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 cursor-pointer hover:bg-slate-900 transition-colors" onClick={() => setIsProfileModalOpen(true)}>
        <div className="max-w-2xl mx-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-slate-700 bg-slate-800 relative">
                  <img src={getAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  {isBuffActive && <div className="absolute bottom-0 right-0 bg-purple-600 w-3 h-3 rounded-full border border-slate-900"></div>}
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight flex items-center gap-2">{user.name}</h1>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-blue-400 font-bold tracking-wider uppercase border border-blue-500/30 px-1.5 py-0.5 rounded bg-blue-500/10">{gameState.classTitle}</span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-1">
               {currentUser ? (
                  <button onClick={(e) => { e.stopPropagation(); handleLogout(); }} className="text-[10px] bg-emerald-900/50 text-emerald-400 border border-emerald-800 px-2 py-1 rounded flex items-center gap-1 hover:bg-emerald-900 transition-colors"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>Salvo</button>
               ) : (
                  <button onClick={(e) => { e.stopPropagation(); handleGoogleLogin(); }} className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-1 rounded flex items-center gap-1 hover:text-white hover:border-slate-500 transition-colors">☁️ Salvar</button>
               )}
               <div className="text-right">
                <div className="text-3xl font-black text-yellow-400 drop-shadow-sm leading-none">{gameState.level}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">Nível</div>
               </div>
            </div>
          </div>
          
          <div className="relative pt-1">
            <div className="flex mb-2 items-center justify-between">
              <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-100 bg-slate-800 border border-slate-700">XP {gameState.currentXp} / {xpNeeded}</span>
              {isBuffActive && <span className="text-xs font-bold text-purple-400 animate-pulse flex items-center gap-1">{getIcon("Clock", "w-3 h-3")} +{buffPercentage}% XP</span>}
            </div>
            <ProgressBar current={gameState.currentXp} max={xpNeeded} color="bg-gradient-to-r from-blue-500 to-indigo-400" />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        <div className="bg-slate-800/40 border border-slate-700 p-4 rounded-xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
          <div className="flex gap-3">
             <div className="mt-1 min-w-[24px]">{getIcon("Brain", "w-6 h-6 text-blue-400")}</div>
             <div>
               <p className="text-sm text-slate-100 italic leading-relaxed">"{narratorText}"</p>
               {loadingAi && <span className="text-xs text-blue-500 animate-pulse mt-1 block">O Mestre está pensando...</span>}
             </div>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">{getIcon("Activity", "w-4 h-4")} Registrar Atividade</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {ACTIVITIES.map((act) => (
              <button
                key={act.id}
                onClick={() => { setSelectedActivity(act); setIsActivityModalOpen(true); }}
                className="flex flex-col items-center justify-center p-4 bg-slate-800/60 hover:bg-slate-700 border border-slate-700 hover:border-blue-500/50 rounded-xl transition-all active:scale-95 group"
              >
                <div className="mb-2 p-3 rounded-full bg-slate-900 group-hover:bg-slate-800 text-blue-400 group-hover:text-blue-300 transition-colors">
                  {getIcon(act.icon)}
                </div>
                <span className="font-semibold text-sm text-center">{act.label}</span>
                <span className="text-xs text-slate-400">+{isBuffActive ? Math.floor(act.xpPerUnit * gameState.activeBuff!.multiplier) : act.xpPerUnit} XP</span>
              </button>
            ))}
             <button
                onClick={() => setIsSleepModalOpen(true)}
                className="flex flex-col items-center justify-center p-4 bg-indigo-900/30 hover:bg-indigo-900/50 border border-indigo-800 hover:border-indigo-500/50 rounded-xl transition-all active:scale-95 group"
              >
                <div className="mb-2 p-3 rounded-full bg-slate-900 group-hover:bg-slate-800 text-indigo-400 group-hover:text-indigo-300 transition-colors">{getIcon("Moon")}</div>
                <span className="font-semibold text-sm text-indigo-200">Registrar Sono</span>
                <span className="text-xs text-indigo-400/70">Buff de XP</span>
              </button>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Histórico</h2>
          <div className="space-y-2">
            {gameState.logs.length === 0 ? (
              <div className="text-center py-8 text-slate-500/50 text-sm italic">Nenhuma atividade registrada hoje.</div>
            ) : (
              gameState.logs.map((log) => {
                const activity = ACTIVITIES.find(a => a.id === log.activityId);
                return (
                  <div key={log.id} className="bg-slate-800/40 border border-slate-700 rounded-lg p-3 flex items-center justify-between hover:bg-slate-800/80 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-900 rounded-full text-slate-400">{getIcon(activity?.icon || 'Activity', 'w-4 h-4')}</div>
                      <div>
                        <div className="font-medium text-sm">{activity?.label}</div>
                        <div className="text-xs text-slate-400/70">{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • {log.amount} {activity?.unit}</div>
                      </div>
                    </div>
                    <div className="text-right">
                        <div className="text-blue-400 font-bold text-sm">+{log.xpGained} XP</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* Activity Modal */}
      <Modal isOpen={isActivityModalOpen} onClose={() => setIsActivityModalOpen(false)} title={selectedActivity?.label || 'Registrar'}>
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-block p-4 bg-slate-950 rounded-full text-blue-400 mb-2">{selectedActivity && getIcon(selectedActivity.icon, "w-8 h-8")}</div>
            <p className="text-slate-300 text-sm">Quanto você realizou? <br/><span className="text-blue-400 text-xs">Base: {selectedActivity?.xpPerUnit} XP {isBuffActive && <span className="text-purple-400 ml-1">x {gameState.activeBuff?.multiplier} (Buff)</span>}</span></p>
            {selectedActivity?.relatedClass ? (
                <div className="text-emerald-400 text-xs font-bold uppercase tracking-wider">Pontos de Classe: {selectedActivity.relatedClass}</div>
            ) : (
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider">Atividade Básica</div>
            )}
          </div>
          <div>
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quantidade ({selectedActivity?.unit})</label>
             <input type="number" value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-4 text-2xl text-center text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" autoFocus />
          </div>
          <button onClick={handleLogActivity} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20">{getIcon("Plus", "w-5 h-5")} Confirmar</button>
        </div>
      </Modal>

      {/* Sleep Modal */}
      <Modal isOpen={isSleepModalOpen} onClose={() => setIsSleepModalOpen(false)} title="Descanso do Guerreiro">
        <div className="space-y-6">
           <div className="bg-indigo-900/20 border border-indigo-800 rounded-lg p-4 text-sm text-indigo-200"><p>O sono restaura suas energias. Ganhe <strong>+2% XP</strong> por hora (máx 9h). Horas extras causam fadiga.</p></div>
           <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Dormiu às</label><input type="time" value={bedTime} onChange={(e) => setBedTime(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"/></div>
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Acordou às</label><input type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"/></div>
           </div>
           <button onClick={handleRegisterSleep} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20">{getIcon("Moon", "w-5 h-5")} Registrar Descanso</button>
        </div>
      </Modal>

      {/* User Profile Modal */}
      <Modal isOpen={isProfileModalOpen} onClose={() => { setIsProfileModalOpen(false); setIsEditingProfile(false); }} title="Ficha do Personagem" large>
          <div className="flex flex-col items-center">
             
             {/* Edit Button Header */}
             <div className="w-full flex justify-end mb-[-40px] z-10 relative">
                 {!isEditingProfile ? (
                    <button onClick={() => setIsEditingProfile(true)} className="text-slate-400 hover:text-white p-2 rounded bg-slate-800 border border-slate-700">
                        {getIcon("Pencil", "w-4 h-4")}
                    </button>
                 ) : (
                    <button onClick={() => setIsEditingProfile(false)} className="text-red-400 hover:text-red-300 p-2 rounded bg-slate-800 border border-slate-700">
                        {getIcon("X", "w-4 h-4")}
                    </button>
                 )}
             </div>

             <div className="w-32 h-32 rounded-full border-4 border-slate-700 bg-slate-800 overflow-hidden mb-4 shadow-2xl relative z-0">
                <img src={getAvatarUrl} alt="Avatar Grande" className="w-full h-full object-cover" />
             </div>

             {isEditingProfile ? (
                 <form onSubmit={handleUpdateProfile} className="w-full space-y-4 mb-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Profissão (Vida Real)</label>
                      <input name="profession" defaultValue={user.profession} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Gênero</label>
                            <select name="gender" defaultValue={user.gender} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="Masculino">Masculino</option>
                                <option value="Feminino">Feminino</option>
                                <option value="Outros">Outros</option>
                            </select>
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Altura (cm)</label>
                             <input type="number" name="height" defaultValue={user.height} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                    </div>
                    <div>
                         <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Peso (kg)</label>
                         <input type="number" step="0.1" name="weight" defaultValue={user.weight} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <button type="submit" className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2">
                        {getIcon("Save", "w-4 h-4")} Salvar Alterações
                    </button>
                 </form>
             ) : (
                <>
                    <h2 className="text-2xl font-bold text-white">{user.name}</h2>
                    <p className="text-blue-400 font-bold uppercase tracking-widest text-sm mb-1">{gameState.classTitle}</p>
                    <p className="text-slate-500 text-xs mb-6">Nível {gameState.level} • {user.profession} (Vida Real)</p>
                    <div className="flex gap-4 text-xs text-slate-400 mb-6 border-t border-b border-slate-800 py-2 w-full justify-center bg-slate-800/20">
                        <span>{user.height} cm</span>
                        <span>•</span>
                        <span>{user.weight} kg</span>
                        <span>•</span>
                        <span>{user.gender}</span>
                    </div>
                </>
             )}
             
             <div className="w-full bg-slate-950/50 rounded-2xl p-4 border border-slate-800 mb-6">
                <h3 className="text-center text-xs font-bold text-slate-500 uppercase mb-4">Atributos de Classe</h3>
                <RadarChart classPoints={gameState.classPoints} />
             </div>

             <div className="grid grid-cols-2 w-full gap-4 text-center">
                 <div className="bg-slate-800 p-3 rounded-lg">
                    <div className="text-xs text-slate-500 uppercase">XP Total</div>
                    <div className="text-xl font-bold text-white">{gameState.totalXp}</div>
                 </div>
                 <div className="bg-slate-800 p-3 rounded-lg">
                    <div className="text-xs text-slate-500 uppercase">Missões</div>
                    <div className="text-xl font-bold text-white">{gameState.logs.length}</div>
                 </div>
             </div>
          </div>
      </Modal>

    </div>
  );
}