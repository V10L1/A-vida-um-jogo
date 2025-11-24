
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { UserProfile, GameState, ActivityLog, ACTIVITIES, ActivityType, Gender, Attribute, ATTRIBUTE_LABELS, Quest, BASIC_ACTIVITY_IDS, Guild, ChatMessage, GuildMember } from './types';
import { getIcon } from './components/Icons';
import { generateRpgFlavorText } from './services/geminiService';
import { auth, loginWithGoogle, logoutUser, saveUserDataToCloud, loadUserDataFromCloud, checkRedirectResult, createGuild, joinGuild, sendMessage, subscribeToGuild, attackBoss, registerWithEmail, loginWithEmail } from './firebase';
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

// --- Radar Chart Component (Agora exibe Atributos) ---
const RadarChart = ({ attributes }: { attributes: Record<Attribute, number> }) => {
  const size = 300;
  const center = size / 2;
  const radius = (size / 2) - 40; // Padding
  
  // Ordem fixa para o gráfico ficar bonito
  const attributeKeys: Attribute[] = ['STR', 'AGI', 'DEX', 'DRV', 'INT', 'CHA', 'VIG', 'END'];
  
  // Encontrar o valor máximo para normalizar o gráfico (mínimo de 10)
  const values = attributeKeys.map(k => attributes[k] || 0);
  const maxVal = Math.max(20, ...values); // Minimo 20 para visual

  // Helper para calcular coordenadas
  const getCoordinates = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / attributeKeys.length - Math.PI / 2;
    const r = (value / maxVal) * radius;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y };
  };

  // Gerar o caminho do polígono (seus pontos)
  const points = attributeKeys.map((key, i) => {
    const val = attributes[key] || 0;
    const { x, y } = getCoordinates(i, val);
    return `${x},${y}`;
  }).join(" ");

  // Gerar o polígono de fundo
  const backgroundPoints = attributeKeys.map((_, i) => {
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
                points={attributeKeys.map((_, i) => {
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
        <polygon points={points} fill="rgba(16, 185, 129, 0.4)" stroke="#10b981" strokeWidth="2" />
        
        {/* Círculos nos vértices */}
        {attributeKeys.map((key, i) => {
            const val = attributes[key] || 0;
            const { x, y } = getCoordinates(i, val);
            return <circle key={i} cx={x} cy={y} r="3" fill="#34d399" />;
        })}

        {/* Labels */}
        {attributeKeys.map((key, i) => {
          const { x, y } = getCoordinates(i, maxVal + (maxVal * 0.18)); 
          const val = attributes[key] || 0;
          return (
            <g key={i}>
                <text 
                x={x} 
                y={y - 5} 
                textAnchor="middle" 
                dominantBaseline="middle" 
                className="text-[10px] fill-slate-300 font-bold uppercase"
                style={{ fontSize: '10px' }}
                >
                {ATTRIBUTE_LABELS[key]}
                </text>
                <text 
                x={x} 
                y={y + 8} 
                textAnchor="middle" 
                dominantBaseline="middle" 
                className="text-[9px] fill-emerald-400 font-bold"
                >
                {Math.floor(val)}
                </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// --- Configuração das Categorias Principais ---
const ACTIVITY_CATEGORIES = [
  { 
    id: 'physical', 
    label: 'Treino Físico', 
    types: ['fitness', 'health'], 
    color: 'text-blue-400',
    icon: 'Dumbbell'
  },
  { 
    id: 'combat', 
    label: 'Treino Combate', 
    types: ['combat'], 
    color: 'text-red-400',
    icon: 'Swords'
  },
  { 
    id: 'intellect', 
    label: 'Atividades Intelectuais', 
    types: ['intellect'], 
    color: 'text-purple-400',
    icon: 'Brain'
  },
  { 
    id: 'social', 
    label: 'Bom-feitor', 
    types: ['social'], 
    color: 'text-emerald-400',
    icon: 'Heart'
  }
];

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
    attributes: { STR: 0, END: 0, VIG: 0, AGI: 0, DEX: 0, INT: 0, CHA: 0, DRV: 0 }, 
    activeBuff: null,
    quests: []
  });
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isSleepModalOpen, setIsSleepModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isQuestModalOpen, setIsQuestModalOpen] = useState(false);
  const [isGuildModalOpen, setIsGuildModalOpen] = useState(false);

  const [selectedActivity, setSelectedActivity] = useState<ActivityType | null>(null);
  const [inputAmount, setInputAmount] = useState('');

  // --- Gym Workout State ---
  const [gymExercise, setGymExercise] = useState('');
  const [gymWeight, setGymWeight] = useState('');
  const [gymReps, setGymReps] = useState('');
  const [gymRestTime, setGymRestTime] = useState('02:00'); // Default 2 mins
  const [isResting, setIsResting] = useState(false);
  const [timerTimeLeft, setTimerTimeLeft] = useState(0);
  
  // Sleep Inputs
  const [bedTime, setBedTime] = useState('22:00');
  const [wakeTime, setWakeTime] = useState('06:00');

  const [narratorText, setNarratorText] = useState<string>("Bem-vindo ao LifeRPG. Comece sua jornada!");
  const [loadingAi, setLoadingAi] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  
  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  // Auth Views: 'onboarding' (creates character locally), 'login' (email/pass), 'register' (new account email/pass)
  const [authView, setAuthView] = useState<'onboarding' | 'login' | 'register'>('onboarding');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');

  // Guild State
  const [currentGuild, setCurrentGuild] = useState<Guild | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [guildInputId, setGuildInputId] = useState('');
  const [guildCreateName, setGuildCreateName] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [guildTab, setGuildTab] = useState<'info' | 'chat' | 'raid'>('info');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // Constants
  const XP_FOR_NEXT_LEVEL_BASE = 100;

  // --- Connectivity Listeners ---
  useEffect(() => {
    const handleOnline = () => {
        setIsOnline(true);
        // Try to sync if we have dirty data
        const needsSync = localStorage.getItem('liferpg_needs_sync') === 'true';
        if (needsSync && currentUser && user && gameState) {
             setNarratorText("Conexão restabelecida. Sincronizando dados...");
             setIsSyncing(true);
             saveUserDataToCloud(currentUser.uid, user, gameState).then((success) => {
                 if (success) {
                     localStorage.removeItem('liferpg_needs_sync');
                     setNarratorText("Sincronização concluída!");
                 }
                 setIsSyncing(false);
             });
        }
    };
    const handleOffline = () => {
        setIsOnline(false);
        setNarratorText("Você está offline. Progresso será salvo localmente.");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, [currentUser, user, gameState]);

  // --- Timer Effect ---
  useEffect(() => {
    if (isResting && timerTimeLeft > 0) {
        timerIntervalRef.current = window.setInterval(() => {
            setTimerTimeLeft(prev => {
                if (prev <= 1) {
                    setIsResting(false);
                    // Play sound or vibrate
                    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    } else {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [isResting, timerTimeLeft]);
  
  // Helper para gerar quests
  const generateNewQuests = (currentQuests: Quest[], currentClass: string, lastDaily?: number, lastWeekly?: number): { quests: Quest[], lastDaily: number, lastWeekly: number } => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = now.getDay();
    const diff = now.getDate() - day;
    const weekStart = new Date(now.setDate(diff)).setHours(0,0,0,0);

    let newQuests = [...currentQuests];
    let newLastDaily = lastDaily || 0;
    let newLastWeekly = lastWeekly || 0;
    
    // Separar Pools de Atividade
    const basicActivities = ACTIVITIES.filter(a => BASIC_ACTIVITY_IDS.includes(a.id));
    const allClassActivities = ACTIVITIES.filter(a => !BASIC_ACTIVITY_IDS.includes(a.id));

    // Determinar atividades de classe baseadas no arquétipo do jogador
    let filteredClassActivities = allClassActivities;
    
    if (currentClass.includes('Mago')) {
        filteredClassActivities = allClassActivities.filter(a => a.category === 'intellect');
    } else if (currentClass.includes('Healer') || currentClass.includes('Conselheiro')) {
        filteredClassActivities = allClassActivities.filter(a => a.category === 'social');
    } else if (currentClass === 'Motorista') {
        filteredClassActivities = allClassActivities.filter(a => a.id === 'drive');
    } else if (['Bodybuilder', 'Tanque', 'Lutador', 'Berseker'].some(c => currentClass.includes(c))) {
        filteredClassActivities = allClassActivities.filter(a => a.primaryAttribute === 'STR' || a.category === 'combat' || a.id === 'gym');
    } else if (['Corredor', 'Biker', 'Velocista'].some(c => currentClass.includes(c))) {
        // Agora verifica VIG
        filteredClassActivities = allClassActivities.filter(a => a.primaryAttribute === 'VIG' || a.id === 'bike' || a.id === 'hiit');
    } else if (['Atirador', 'Pistoleiro', 'Espadachim'].some(c => currentClass.includes(c))) {
        filteredClassActivities = allClassActivities.filter(a => a.primaryAttribute === 'DEX' || a.category === 'combat');
    }

    // Se o filtro for muito restrito e não tiver nada, usa o geral
    if (filteredClassActivities.length === 0) filteredClassActivities = allClassActivities;

    // Determinar quantidade baseada na classe
    const isBasicClass = currentClass === 'NPC' || currentClass === 'Aventureiro';
    const numBasicDaily = isBasicClass ? 3 : 2;
    const numClassDaily = isBasicClass ? 0 : 1;

    // Helper para calcular alvo baseado na unidade
    const getTarget = (act: ActivityType, type: 'daily' | 'weekly') => {
        let dailyBase = 1;
        if (act.unit === 'km') dailyBase = 3;
        if (act.unit === 'reps') dailyBase = 20;
        if (act.unit === 'min') dailyBase = 20;
        if (act.unit === 'copos') dailyBase = 6;
        if (act.unit === 'pág/min') dailyBase = 15;
        if (act.unit === 'sessão') dailyBase = 1;
        if (act.unit === 'ação') dailyBase = 1;
        if (act.id === 'drive') dailyBase = 20;
        if (act.id === 'gym') dailyBase = 3; // 3 series por dia

        if (type === 'weekly') return dailyBase * 7;
        return dailyBase;
    };

    // --- GERAR DIÁRIAS ---
    if (!lastDaily || lastDaily < todayStart) {
        newQuests = newQuests.filter(q => q.type !== 'daily');
        
        const shuffledBasic = [...basicActivities].sort(() => 0.5 - Math.random());
        const selectedDaily = shuffledBasic.slice(0, numBasicDaily);
        
        if (numClassDaily > 0) {
            const shuffledClass = [...filteredClassActivities].sort(() => 0.5 - Math.random());
            if (shuffledClass.length > 0) selectedDaily.push(shuffledClass[0]);
        }

        selectedDaily.forEach(act => {
            const target = getTarget(act, 'daily');
            newQuests.push({
                id: `daily-${Date.now()}-${act.id}`,
                type: 'daily',
                activityId: act.id,
                targetAmount: target,
                currentAmount: 0,
                xpReward: Math.floor(target * act.xpPerUnit * 1.2),
                isClaimed: false,
                createdAt: Date.now()
            });
        });
        newLastDaily = Date.now();
    }

    // --- GERAR SEMANAIS ---
    if (!lastWeekly || lastWeekly < weekStart) {
        newQuests = newQuests.filter(q => q.type !== 'weekly');

        const shuffledBasic = [...basicActivities].sort(() => 0.5 - Math.random());
        const selectedWeekly = shuffledBasic.slice(0, numBasicDaily);
        
        if (numClassDaily > 0) {
            const shuffledClass = [...filteredClassActivities].sort(() => 0.5 - Math.random());
            if (shuffledClass.length > 0) selectedWeekly.push(shuffledClass[0]);
        }

        selectedWeekly.forEach(act => {
            const target = getTarget(act, 'weekly');
            newQuests.push({
                id: `weekly-${Date.now()}-${act.id}`,
                type: 'weekly',
                activityId: act.id,
                targetAmount: target,
                currentAmount: 0,
                xpReward: Math.floor(target * act.xpPerUnit * 2.0),
                isClaimed: false,
                createdAt: Date.now()
            });
        });
        newLastWeekly = Date.now();
    }

    return { quests: newQuests, lastDaily: newLastDaily, lastWeekly: newLastWeekly };
  };

  // Initialize & Auth Listener
  useEffect(() => {
    const savedUser = localStorage.getItem('liferpg_user');
    const savedGame = localStorage.getItem('liferpg_game');
    const needsSync = localStorage.getItem('liferpg_needs_sync') === 'true';
    
    if (savedUser) setUser(JSON.parse(savedUser));
    if (savedGame) {
        const parsedGame = JSON.parse(savedGame);
        // Fallback robusto para garantir que DRV e VIG existam em saves antigos
        const safeAttributes = {
             STR: 0, END: 0, VIG: 0, AGI: 0, DEX: 0, INT: 0, CHA: 0, DRV: 0,
             ...parsedGame.attributes
        };
        const currentClass = parsedGame.classTitle || "NPC";

        const initialQuests = parsedGame.quests || [];
        const { quests, lastDaily, lastWeekly } = generateNewQuests(
            initialQuests, 
            currentClass,
            parsedGame.lastDailyQuestGen, 
            parsedGame.lastWeeklyQuestGen
        );

        setGameState(prev => ({ 
            ...prev, 
            ...parsedGame,
            classTitle: currentClass,
            attributes: safeAttributes,
            quests: quests,
            lastDailyQuestGen: lastDaily,
            lastWeeklyQuestGen: lastWeekly
        }));

        if (parsedGame.guildId && navigator.onLine) {
            subscribeToGuild(parsedGame.guildId, (guild, messages) => {
                setCurrentGuild(guild);
                if (messages) setChatMessages(messages);
            });
        }
    } else {
        const { quests, lastDaily, lastWeekly } = generateNewQuests([], "NPC", 0, 0);
        setGameState(prev => ({
            ...prev,
            quests,
            lastDailyQuestGen: lastDaily,
            lastWeeklyQuestGen: lastWeekly
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
          
          if (needsSync && savedUser && savedGame) {
              console.log("Local changes detected. Syncing UP to cloud instead of DOWN.");
              const success = await saveUserDataToCloud(firebaseUser.uid, JSON.parse(savedUser), JSON.parse(savedGame));
              if (success) {
                  localStorage.removeItem('liferpg_needs_sync');
                  setNarratorText("Sincronização pendente concluída!");
              }
              setIsSyncing(false);
          } else {
              const cloudData = await loadUserDataFromCloud(firebaseUser.uid);
              if (cloudData) {
                setUser(cloudData.userProfile);
                
                const cloudGame = cloudData.gameState;
                const safeAttributes = {
                    STR: 0, END: 0, VIG: 0, AGI: 0, DEX: 0, INT: 0, CHA: 0, DRV: 0,
                    ...cloudGame.attributes
                };
                const currentClass = cloudGame.classTitle || "NPC";
                const { quests, lastDaily, lastWeekly } = generateNewQuests(
                    cloudGame.quests || [],
                    currentClass,
                    cloudGame.lastDailyQuestGen, 
                    cloudGame.lastWeeklyQuestGen
                );

                setGameState(prev => ({ 
                    ...prev, 
                    ...cloudGame,
                    attributes: safeAttributes,
                    quests,
                    lastDailyQuestGen: lastDaily,
                    lastWeeklyQuestGen: lastWeekly
                })); 

                if (cloudGame.guildId) {
                    subscribeToGuild(cloudGame.guildId, (guild, messages) => {
                        setCurrentGuild(guild);
                        if (messages) setChatMessages(messages);
                    });
                }

                setNarratorText("Sincronização completa. Bem-vindo de volta, herói!");
              } else {
                  if (savedUser && savedGame) {
                      await saveUserDataToCloud(firebaseUser.uid, JSON.parse(savedUser), JSON.parse(savedGame));
                  } else {
                      setAuthView('onboarding');
                  }
              }
              setIsSyncing(false);
          }
        }
      });
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem('liferpg_user', JSON.stringify(user));
      if (currentUser && gameState) {
          saveUserDataToCloud(currentUser.uid, user, gameState).then((success) => {
              if (!success) localStorage.setItem('liferpg_needs_sync', 'true');
          });
      }
    }
  }, [user]);

  useEffect(() => {
    if (gameState) {
      localStorage.setItem('liferpg_game', JSON.stringify(gameState));
      if (currentUser && user) {
          saveUserDataToCloud(currentUser.uid, user, gameState).then((success) => {
              if (!success) {
                  console.log("Offline or Save Failed. Marking for Sync.");
                  localStorage.setItem('liferpg_needs_sync', 'true');
              }
          });
      }
    }
  }, [gameState]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isGuildModalOpen, guildTab]);

  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (e: any) {
      alert("Erro ao iniciar login: " + e.message);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
          if (authView === 'register') {
              if (authPassword !== authConfirmPassword) {
                  alert("As senhas não conferem!");
                  return;
              }
              await registerWithEmail(authEmail, authPassword);
          } else {
              await loginWithEmail(authEmail, authPassword);
          }
      } catch (e: any) {
          let msg = e.message;
          if (e.code === 'auth/invalid-credential') msg = "E-mail ou senha incorretos.";
          if (e.code === 'auth/email-already-in-use') msg = "Este e-mail já está cadastrado.";
          if (e.code === 'auth/weak-password') msg = "A senha deve ter pelo menos 6 caracteres.";
          alert(msg);
      }
  };

  const handleLogout = async () => {
    await logoutUser();
    setUser(null); // Clear local session view
    setAuthView('onboarding'); // Reset view
  };

  const calculateXpForNextLevel = (level: number) => {
    return level * XP_FOR_NEXT_LEVEL_BASE;
  };

  // --- LÓGICA DE CLASSES BASEADA EM ATRIBUTOS ---
  const determineClass = (attrs: Record<Attribute, number>): string => {
      // 1. Encontrar Atributo Dominante
      let maxAttr: Attribute = 'STR';
      let maxVal = -1;
      
      for (const key of Object.keys(attrs) as Attribute[]) {
        if (attrs[key] > maxVal) {
            maxVal = attrs[key];
            maxAttr = key;
        }
      }

      if (maxVal < 10) return "NPC"; // Ainda não treinou o suficiente

      // 2. Encontrar Secundário
      let secondMaxAttr: Attribute | null = null;
      let secondMaxVal = -1;
      
      for (const key of Object.keys(attrs) as Attribute[]) {
        if (key !== maxAttr && attrs[key] > secondMaxVal) {
            secondMaxVal = attrs[key];
            secondMaxAttr = key;
        }
      }

      // 3. Regras de Classes (Arquétipos)
      const isSecondaryRelevant = secondMaxAttr && secondMaxVal > (maxVal * 0.4); // Secundário tem que ser pelo menos 40% do principal

      switch (maxAttr) {
          case 'STR': // Força Dominante
              if (isSecondaryRelevant && secondMaxAttr === 'END') return "Tanque"; // Força + Resistência Muscular
              if (isSecondaryRelevant && secondMaxAttr === 'DEX') return "Lutador";
              if (isSecondaryRelevant && secondMaxAttr === 'AGI') return "Berseker";
              return "Bodybuilder";
          
          case 'VIG': // Vigor Dominante (Cardio) - Antigo END
              if (isSecondaryRelevant && secondMaxAttr === 'STR') return "Biker"; 
              if (isSecondaryRelevant && secondMaxAttr === 'AGI') return "Corredor"; // Ou Triatleta
              return "Corredor";

          case 'END': // Resistência Muscular Dominante
               if (isSecondaryRelevant && secondMaxAttr === 'STR') return "Crossfitter"; // Alta Repetição + Força
               return "Atleta de Resistência";

          case 'AGI': // Agilidade Dominante
              if (isSecondaryRelevant && secondMaxAttr === 'DEX') return "Espadachim"; // Rapidez + Técnica
              return "Velocista"; // Ou Ninja

          case 'DEX': // Destreza Dominante
              if (isSecondaryRelevant && secondMaxAttr === 'STR') return "Lutador";
              if (isSecondaryRelevant && secondMaxAttr === 'AGI') return "Espadachim";
              return "Atirador";

          case 'INT': // Intelecto Dominante
              return "Mago";

          case 'CHA': // Carisma Dominante
              if (isSecondaryRelevant && secondMaxAttr === 'INT') return "Conselheiro";
              return "Healer";

          case 'DRV': // Perícia Volante Dominante
              return "Motorista";
          
          default:
              return "Aventureiro";
      }
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
        profession: formData.get('profession') as string,
    };
    setUser(updatedUser);
    setIsEditingProfile(false);
    setNarratorText(`Perfil atualizado! Você parece diferente, ${updatedUser.name}.`);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 300;
            const MAX_HEIGHT = 300;
            let width = img.width;
            let height = img.height;
            if (width > height) {
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
            } else {
                if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            setUser({ ...user, avatarImage: dataUrl });
        };
        img.src = event.target.result as string;
    };
    reader.readAsDataURL(file);
  };

  const updateNarrator = async (u: UserProfile, g: GameState, activityName?: string, isInit = false) => {
    if (!isOnline) {
        if (isInit) setNarratorText("Bem-vindo ao modo offline. Sua jornada continua!");
        else setNarratorText("Atividade registrada localmente.");
        return;
    }
    
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
    if (!selectedActivity) return;

    let amount = 0;
    let xpGained = 0;
    let details: ActivityLog['details'] | undefined = undefined;

    const newAttributes = { ...gameState.attributes };

    // --- Lógica Especial para Musculação ---
    if (selectedActivity.id === 'gym') {
        const weight = Number(gymWeight) || 0;
        const reps = Number(gymReps) || 0;
        if (reps <= 0) return;

        amount = 1; // 1 série
        
        // XP baseado em Volume Load (Peso * Reps)
        // Se for peso do corpo (0kg), considera como se fosse 10kg para não zerar
        const effectiveWeight = weight > 0 ? weight : 10;
        // Fórmula de XP: Volume / 5. Ex: 30kg * 12reps = 360 vol / 5 = 72 XP.
        xpGained = Math.floor((effectiveWeight * reps) / 5) + 5; 

        details = {
            exercise: gymExercise || 'Exercício',
            weight: weight,
            reps: reps,
            restTime: 0 // Será tratado pelo timer visual
        };

        // --- Distribuição de Atributos Baseada em Faixas de Repetição ---
        // Pontos ganhos são proporcionais ao XP, mas escalados para não inflacionar os atributos demais
        const attributePoints = Math.ceil(xpGained / 5);

        if (reps <= 6) {
            // Força Bruta (STR)
            newAttributes.STR = (newAttributes.STR || 0) + attributePoints;
            newAttributes.END = (newAttributes.END || 0) + Math.ceil(attributePoints * 0.5);
        } else if (reps >= 7 && reps <= 9) {
            // Híbrido (70% cada)
            newAttributes.STR = (newAttributes.STR || 0) + Math.ceil(attributePoints * 0.7);
            newAttributes.END = (newAttributes.END || 0) + Math.ceil(attributePoints * 0.7);
        } else {
            // Resistência Muscular (END) - Reps >= 10
            newAttributes.END = (newAttributes.END || 0) + attributePoints;
            newAttributes.STR = (newAttributes.STR || 0) + Math.ceil(attributePoints * 0.5);
        }

        // Iniciar timer
        const [mins, secs] = gymRestTime.split(':').map(Number);
        const totalSecs = (mins * 60) + secs;
        if (totalSecs > 0) {
            setTimerTimeLeft(totalSecs);
            setIsResting(true);
        }
    } else {
        // Lógica Padrão para outras atividades
        if (!inputAmount || isNaN(Number(inputAmount))) return;
        amount = Number(inputAmount);
        xpGained = Math.floor(amount * selectedActivity.xpPerUnit);

        let pointsEarned = Math.ceil(amount);
        if (selectedActivity.primaryAttribute) {
            newAttributes[selectedActivity.primaryAttribute] = (newAttributes[selectedActivity.primaryAttribute] || 0) + pointsEarned;
        }
        if (selectedActivity.secondaryAttribute) {
            newAttributes[selectedActivity.secondaryAttribute] = (newAttributes[selectedActivity.secondaryAttribute] || 0) + Math.ceil(pointsEarned * 0.5);
        }
    }

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
      details: details
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

    // --- Atualizar Quests ---
    const updatedQuests = gameState.quests.map(q => {
        if (!q.isClaimed && q.activityId === selectedActivity.id) {
            return {
                ...q,
                currentAmount: q.currentAmount + amount
            };
        }
        return q;
    });

    const newClassTitle = determineClass(newAttributes);

    const activeBuff = (gameState.activeBuff && Date.now() < gameState.activeBuff.expiresAt) 
        ? gameState.activeBuff 
        : null;

    const newState = {
      ...gameState,
      level: newLevel,
      currentXp: newCurrentXp,
      totalXp: newTotalXp,
      logs: [newLog, ...gameState.logs].slice(0, 50),
      attributes: newAttributes,
      classTitle: newClassTitle,
      activeBuff: activeBuff,
      quests: updatedQuests
    };

    setGameState(newState);
    
    // Só fecha o modal se não for Gym (pois Gym tem o timer)
    if (selectedActivity.id !== 'gym') {
        setIsActivityModalOpen(false);
        setInputAmount('');
        setSelectedActivity(null);
    }
    
    if (leveledUp) {
      setShowLevelUp(true);
      setTimeout(() => setShowLevelUp(false), 5000);
      updateNarrator(user!, newState, "LEVEL UP");
    } else {
        if (selectedActivity.id !== 'gym') {
             updateNarrator(user!, newState, selectedActivity.label + (buffApplied ? " (Buffado)" : ""));
        }
    }
  };

  const handleClaimQuest = (questId: string) => {
      const quest = gameState.quests.find(q => q.id === questId);
      if (!quest || quest.isClaimed || quest.currentAmount < quest.targetAmount) return;

      const xpGained = quest.xpReward;
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

      const updatedQuests = gameState.quests.map(q => 
        q.id === questId ? { ...q, isClaimed: true } : q
      );

      const newState = {
          ...gameState,
          level: newLevel,
          currentXp: newCurrentXp,
          totalXp: newTotalXp,
          quests: updatedQuests
      };

      setGameState(newState);
      if (leveledUp) {
          setShowLevelUp(true);
          setTimeout(() => setShowLevelUp(false), 5000);
      }
      setNarratorText("Recompensa de missão coletada!");
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

  const handleCreateGuild = async () => {
      if (!isOnline) {
          alert("Você precisa estar online para criar uma guilda.");
          return;
      }
      if (!currentUser || !guildCreateName) return;
      const guildId = await createGuild(guildCreateName, currentUser.uid, user!.name, user!.avatarImage, gameState.classTitle, gameState.level);
      if (guildId) {
          setGameState(prev => ({ ...prev, guildId }));
      }
  };

  const handleJoinGuild = async () => {
      if (!isOnline) {
          alert("Você precisa estar online para entrar em uma guilda.");
          return;
      }
      if (!currentUser || !guildInputId) return;
      const success = await joinGuild(guildInputId, currentUser.uid, user!.name, user!.avatarImage, gameState.classTitle, gameState.level);
      if (success) {
          setGameState(prev => ({ ...prev, guildId: guildInputId }));
          setGuildInputId('');
      } else {
          alert("Guilda não encontrada ou erro ao entrar.");
      }
  };

  const handleSendMessage = async () => {
      if (!currentUser || !currentGuild || !chatInput.trim()) return;
      await sendMessage(currentGuild.id, currentUser.uid, user!.name, chatInput);
      setChatInput('');
  };

  const handleAttackBoss = async () => {
      if (!isOnline) {
          alert("Você precisa estar online para atacar o Boss.");
          return;
      }
      if (!currentUser || !currentGuild || !currentGuild.boss) return;
      const damage = 10 + (gameState.level * 2);
      await attackBoss(currentGuild.id, damage, user!.name);
  };

  const getAvatarUrl = useMemo(() => {
    if (!user) return '';
    if (user.avatarImage) return user.avatarImage;
    const seed = user.name.replace(/\s/g, '');
    let style = 'micah';
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

  const dailyQuests = gameState.quests.filter(q => q.type === 'daily');
  const weeklyQuests = gameState.quests.filter(q => q.type === 'weekly');
  const unclaimedQuestsCount = gameState.quests.filter(q => q.currentAmount >= q.targetAmount && !q.isClaimed).length;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500 mb-2">LifeRPG</h1>
            <p className="text-slate-400 text-sm">Gamifique sua Evolução</p>
          </div>

          <div className="bg-slate-900/80 p-6 rounded-2xl shadow-xl border border-slate-800 backdrop-blur-sm">
            
            {/* Abas de Navegação Auth */}
            <div className="flex border-b border-slate-700 mb-6">
                <button onClick={() => setAuthView('onboarding')} className={`flex-1 pb-2 text-sm font-bold uppercase transition-colors ${authView === 'onboarding' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
                    Criar Personagem
                </button>
                <button onClick={() => setAuthView('login')} className={`flex-1 pb-2 text-sm font-bold uppercase transition-colors ${authView === 'login' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
                    Entrar
                </button>
                <button onClick={() => setAuthView('register')} className={`flex-1 pb-2 text-sm font-bold uppercase transition-colors ${authView === 'register' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
                    Cadastrar
                </button>
            </div>

            {authView === 'onboarding' ? (
                <form onSubmit={handleOnboarding} className="space-y-4 animate-fade-in">
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
                    <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/20">Iniciar Jogo Local</button>
                    <p className="text-[10px] text-slate-500 text-center">Os dados ficam salvos apenas neste dispositivo.</p>
                </form>
            ) : (
                <form onSubmit={handleEmailAuth} className="space-y-4 animate-fade-in">
                     <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">E-mail</label>
                        <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="seu@email.com" />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Senha</label>
                        <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="******" />
                     </div>
                     {authView === 'register' && (
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Confirmar Senha</label>
                            <input 
                                type="password" 
                                value={authConfirmPassword} 
                                onChange={e => setAuthConfirmPassword(e.target.value)} 
                                required 
                                className={`w-full bg-slate-950 border rounded-lg p-3 text-white focus:ring-2 outline-none ${authPassword && authConfirmPassword && authPassword !== authConfirmPassword ? 'border-red-500 focus:ring-red-500' : 'border-slate-700 focus:ring-blue-500'}`} 
                                placeholder="******" 
                            />
                            {authPassword && authConfirmPassword && authPassword !== authConfirmPassword && (
                                <p className="text-red-500 text-xs mt-1 font-bold">As senhas não conferem!</p>
                            )}
                        </div>
                     )}
                     <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors">
                         {authView === 'register' ? 'Criar Conta' : 'Entrar'}
                     </button>
                     
                     <div className="flex items-center gap-4 before:h-px before:flex-1 before:bg-slate-700 after:h-px after:flex-1 after:bg-slate-700">
                       <span className="text-slate-500 text-xs font-bold uppercase">OU</span>
                     </div>
                     
                     <button type="button" onClick={handleGoogleLogin} className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                         {getIcon("User", "w-4 h-4")} Continuar com Google
                     </button>
                </form>
            )}

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

      {/* Header Profile Card */}
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
               <div className="flex gap-2">
                   <button onClick={(e) => { e.stopPropagation(); setIsGuildModalOpen(true); }} className="relative text-[10px] bg-indigo-900/40 text-indigo-400 border border-indigo-700/50 px-2 py-1 rounded flex items-center gap-1 hover:bg-indigo-900/60 transition-colors">
                        {getIcon("Shield", "w-3 h-3")} Clã
                   </button>
                   <button onClick={(e) => { e.stopPropagation(); setIsQuestModalOpen(true); }} className="relative text-[10px] bg-amber-900/40 text-amber-400 border border-amber-700/50 px-2 py-1 rounded flex items-center gap-1 hover:bg-amber-900/60 transition-colors">
                        {getIcon("Scroll", "w-3 h-3")} Quests
                        {unclaimedQuestsCount > 0 && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>}
                   </button>
                   {currentUser ? (
                      isSyncing ? (
                         <button className="text-[10px] bg-blue-900/50 text-blue-400 border border-blue-800 px-2 py-1 rounded flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-full animate-spin"></div> Sync</button>
                      ) : isOnline ? (
                         <button onClick={(e) => { e.stopPropagation(); handleLogout(); }} className="text-[10px] bg-emerald-900/50 text-emerald-400 border border-emerald-800 px-2 py-1 rounded flex items-center gap-1 hover:bg-emerald-900 transition-colors"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>Salvo</button>
                      ) : (
                         <button className="text-[10px] bg-red-900/50 text-red-400 border border-red-800 px-2 py-1 rounded flex items-center gap-1"><div className="w-2 h-2 bg-red-500 rounded-full"></div>Offline</button>
                      )
                   ) : (
                      <button onClick={(e) => { e.stopPropagation(); handleLogout(); }} className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-1 rounded flex items-center gap-1 hover:text-white hover:border-slate-500 transition-colors">☁️ Login</button>
                   )}
               </div>
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
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                {getIcon("Activity", "w-4 h-4")} Painel de Missões
            </h2>
            
            {ACTIVITY_CATEGORIES.map((category) => (
                <div key={category.id} className="mb-6 last:mb-0">
                     <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ${category.color} flex items-center gap-2 pl-1 border-l-2 border-slate-700`}>
                        {getIcon(category.icon, "w-4 h-4")} {category.label}
                     </h3>
                     <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {ACTIVITIES.filter(act => category.types.includes(act.category)).map((act) => (
                        <button
                            key={act.id}
                            onClick={() => { setSelectedActivity(act); setIsActivityModalOpen(true); }}
                            className="flex flex-col items-center justify-center p-3 bg-slate-800/60 hover:bg-slate-700 border border-slate-700 hover:border-blue-500/50 rounded-xl transition-all active:scale-95 group"
                        >
                            <div className="mb-2 p-2 rounded-full bg-slate-900 group-hover:bg-slate-800 text-blue-400 group-hover:text-blue-300 transition-colors">
                            {getIcon(act.icon)}
                            </div>
                            <span className="font-semibold text-xs text-center">{act.label}</span>
                            <span className="text-[10px] text-slate-400 mt-1">+{isBuffActive ? Math.floor(act.xpPerUnit * gameState.activeBuff!.multiplier) : act.xpPerUnit} XP</span>
                        </button>
                        ))}
                        
                        {category.id === 'physical' && (
                            <button
                                onClick={() => setIsSleepModalOpen(true)}
                                className="flex flex-col items-center justify-center p-3 bg-indigo-900/30 hover:bg-indigo-900/50 border border-indigo-800 hover:border-indigo-500/50 rounded-xl transition-all active:scale-95 group"
                            >
                                <div className="mb-2 p-2 rounded-full bg-slate-900 group-hover:bg-slate-800 text-indigo-400 group-hover:text-indigo-300 transition-colors">{getIcon("Moon")}</div>
                                <span className="font-semibold text-xs text-indigo-200">Registrar Sono</span>
                                <span className="text-[10px] text-indigo-400/70 mt-1">Recuperação</span>
                            </button>
                        )}
                     </div>
                </div>
            ))}
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
                        {log.details ? (
                             <div className="text-xs text-blue-300">{log.details.exercise} • {log.details.weight}kg x {log.details.reps}</div>
                        ) : (
                             <div className="text-xs text-slate-400/70">{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • {log.amount} {activity?.unit}</div>
                        )}
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
        {selectedActivity?.id === 'gym' && isResting ? (
             // --- GYM TIMER VIEW ---
             <div className="flex flex-col items-center justify-center space-y-6 py-6">
                 <div className="text-center animate-pulse">
                    <h3 className="text-slate-400 text-sm uppercase tracking-widest font-bold mb-2">Descanso</h3>
                    <div className="text-6xl font-black text-white tabular-nums">
                        {Math.floor(timerTimeLeft / 60).toString().padStart(2, '0')}:{(timerTimeLeft % 60).toString().padStart(2, '0')}
                    </div>
                 </div>
                 <div className="flex gap-4">
                     <button onClick={() => { setIsResting(false); setTimerTimeLeft(0); }} className="bg-red-900/50 hover:bg-red-900 text-red-200 px-6 py-3 rounded-xl font-bold flex items-center gap-2">
                         {getIcon("X", "w-5 h-5")} Pular
                     </button>
                     <button onClick={() => setTimerTimeLeft(prev => prev + 30)} className="bg-blue-900/50 hover:bg-blue-900 text-blue-200 px-6 py-3 rounded-xl font-bold flex items-center gap-2">
                         {getIcon("Plus", "w-5 h-5")} +30s
                     </button>
                 </div>
                 <p className="text-xs text-slate-500">Respire fundo. A próxima série te espera.</p>
             </div>
        ) : selectedActivity?.id === 'gym' ? (
             // --- GYM INPUT FORM ---
             <div className="space-y-4">
                 <div className="bg-slate-800 p-3 rounded-lg border border-slate-700 flex items-center gap-3 mb-4">
                     <div className="p-2 bg-slate-900 rounded-full text-blue-400">{getIcon("Biceps")}</div>
                     <div className="text-sm text-slate-300">Registre sua série. Pontos: <br/> ≤6 reps (Força) • 7-9 (Híbrido) • ≥10 (Resistência)</div>
                 </div>
                 
                 <div>
                     <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Exercício</label>
                     <input type="text" value={gymExercise} onChange={(e) => setGymExercise(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: Supino Reto" autoFocus />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                     <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Carga (kg)</label>
                         <input type="number" value={gymWeight} onChange={(e) => setGymWeight(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
                     </div>
                     <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Repetições</label>
                         <input type="number" value={gymReps} onChange={(e) => setGymReps(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
                     </div>
                 </div>

                 <div>
                     <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">{getIcon("Timer", "w-3 h-3")} Intervalo (min:seg)</label>
                     <input type="time" value={gymRestTime} onChange={(e) => setGymRestTime(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                 </div>

                 <button onClick={handleLogActivity} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 mt-4">
                     {getIcon("CheckCircle", "w-5 h-5")} Concluir Série
                 </button>
             </div>
        ) : (
            // --- STANDARD INPUT ---
            <div className="space-y-6">
            <div className="text-center space-y-2">
                <div className="inline-block p-4 bg-slate-950 rounded-full text-blue-400 mb-2">{selectedActivity && getIcon(selectedActivity.icon, "w-8 h-8")}</div>
                <p className="text-slate-300 text-sm">Quanto você realizou? <br/><span className="text-blue-400 text-xs">Base: {selectedActivity?.xpPerUnit} XP {isBuffActive && <span className="text-purple-400 ml-1">x {gameState.activeBuff?.multiplier} (Buff)</span>}</span></p>
                {selectedActivity?.primaryAttribute && (
                    <div className="flex justify-center gap-2 mt-2">
                        <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider border border-emerald-900 bg-emerald-900/20 px-2 py-1 rounded">
                            + {selectedActivity.primaryAttribute}
                        </span>
                        {selectedActivity.secondaryAttribute && (
                            <span className="text-emerald-400/70 text-xs font-bold uppercase tracking-wider border border-emerald-900/50 bg-emerald-900/10 px-2 py-1 rounded">
                                + {selectedActivity.secondaryAttribute}
                            </span>
                        )}
                    </div>
                )}
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quantidade ({selectedActivity?.unit})</label>
                <input type="number" value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-4 text-2xl text-center text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" autoFocus />
            </div>
            <button onClick={handleLogActivity} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20">{getIcon("Plus", "w-5 h-5")} Confirmar</button>
            </div>
        )}
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

      {/* Quest Modal */}
      <Modal isOpen={isQuestModalOpen} onClose={() => setIsQuestModalOpen(false)} title="Quests e Contratos">
        <div className="space-y-6">
             {/* Daily Section */}
             <div>
                <h4 className="text-amber-400 font-bold uppercase text-xs tracking-widest mb-2 flex items-center gap-2">{getIcon("Scroll", "w-4 h-4")} Diárias</h4>
                <div className="space-y-3">
                    {dailyQuests.map(quest => {
                         const act = ACTIVITIES.find(a => a.id === quest.activityId);
                         const isComplete = quest.currentAmount >= quest.targetAmount;
                         return (
                            <div key={quest.id} className={`p-3 rounded-lg border flex flex-col gap-2 ${isComplete ? 'bg-emerald-900/20 border-emerald-700' : 'bg-slate-800 border-slate-700'}`}>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-semibold text-slate-200">{act?.label}</span>
                                    <span className="text-xs text-amber-400 font-bold">+{quest.xpReward} XP</span>
                                </div>
                                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                                    <div className="bg-amber-500 h-full transition-all" style={{ width: `${Math.min(100, (quest.currentAmount / quest.targetAmount) * 100)}%` }}></div>
                                </div>
                                <div className="flex justify-between items-center text-xs text-slate-400">
                                    <span>{quest.currentAmount} / {quest.targetAmount} {act?.unit}</span>
                                    {isComplete && !quest.isClaimed && (
                                        <button onClick={() => handleClaimQuest(quest.id)} className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded animate-pulse">
                                            Resgatar
                                        </button>
                                    )}
                                    {quest.isClaimed && <span className="text-emerald-500 font-bold flex items-center gap-1">{getIcon("CheckCircle", "w-3 h-3")} Completo</span>}
                                </div>
                            </div>
                         );
                    })}
                </div>
             </div>
             
             {/* Weekly Section */}
             <div>
                <h4 className="text-purple-400 font-bold uppercase text-xs tracking-widest mb-2 flex items-center gap-2">{getIcon("Trophy", "w-4 h-4")} Semanais</h4>
                <div className="space-y-3">
                    {weeklyQuests.map(quest => {
                         const act = ACTIVITIES.find(a => a.id === quest.activityId);
                         const isComplete = quest.currentAmount >= quest.targetAmount;
                         return (
                            <div key={quest.id} className={`p-3 rounded-lg border flex flex-col gap-2 ${isComplete ? 'bg-emerald-900/20 border-emerald-700' : 'bg-slate-800 border-slate-700'}`}>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-semibold text-slate-200">{act?.label}</span>
                                    <span className="text-xs text-purple-400 font-bold">+{quest.xpReward} XP</span>
                                </div>
                                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                                    <div className="bg-purple-500 h-full transition-all" style={{ width: `${Math.min(100, (quest.currentAmount / quest.targetAmount) * 100)}%` }}></div>
                                </div>
                                <div className="flex justify-between items-center text-xs text-slate-400">
                                    <span>{quest.currentAmount} / {quest.targetAmount} {act?.unit}</span>
                                    {isComplete && !quest.isClaimed && (
                                        <button onClick={() => handleClaimQuest(quest.id)} className="px-3 py-1 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded animate-pulse">
                                            Resgatar
                                        </button>
                                    )}
                                    {quest.isClaimed && <span className="text-emerald-500 font-bold flex items-center gap-1">{getIcon("CheckCircle", "w-3 h-3")} Completo</span>}
                                </div>
                            </div>
                         );
                    })}
                </div>
             </div>
        </div>
      </Modal>

      {/* Guild Modal */}
      <Modal isOpen={isGuildModalOpen} onClose={() => setIsGuildModalOpen(false)} title="Salão da Guilda" large>
           {!gameState.guildId ? (
               <div className="space-y-8 text-center py-6">
                   <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                       <h3 className="text-xl font-bold text-white mb-2">Entrar em uma Guilda</h3>
                       <p className="text-slate-400 text-sm mb-4">Digite o ID da guilda para se juntar aos seus aliados.</p>
                       <div className="flex gap-2">
                           <input value={guildInputId} onChange={(e) => setGuildInputId(e.target.value)} className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none" placeholder="ID da Guilda" />
                           <button onClick={handleJoinGuild} className="bg-blue-600 hover:bg-blue-500 px-4 rounded-lg font-bold">Entrar</button>
                       </div>
                   </div>
                   
                   <div className="flex items-center gap-4 before:h-px before:flex-1 before:bg-slate-700 after:h-px after:flex-1 after:bg-slate-700">
                       <span className="text-slate-500 text-xs font-bold uppercase">OU</span>
                   </div>

                   <div className="bg-indigo-900/20 p-6 rounded-2xl border border-indigo-800">
                       <h3 className="text-xl font-bold text-indigo-300 mb-2">Fundar nova Guilda</h3>
                       <p className="text-indigo-200/60 text-sm mb-4">Crie seu próprio legado.</p>
                       <div className="flex gap-2">
                           <input value={guildCreateName} onChange={(e) => setGuildCreateName(e.target.value)} className="flex-1 bg-slate-950 border border-indigo-800/50 rounded-lg p-3 text-white outline-none" placeholder="Nome da Guilda" />
                           <button onClick={handleCreateGuild} className="bg-indigo-600 hover:bg-indigo-500 px-4 rounded-lg font-bold text-white">Criar</button>
                       </div>
                   </div>
               </div>
           ) : currentGuild ? (
               <div className="flex flex-col h-[60vh]">
                   {/* Guild Header */}
                   <div className="flex justify-between items-center mb-4 bg-slate-800 p-3 rounded-lg">
                       <div>
                           <h2 className="text-xl font-bold text-white flex items-center gap-2">{getIcon("Shield", "w-5 h-5 text-indigo-400")} {currentGuild.name}</h2>
                           <p className="text-xs text-slate-400">Nível {currentGuild.level} • ID: <span className="select-all font-mono bg-slate-900 px-1 rounded">{currentGuild.id}</span></p>
                       </div>
                       <div className="flex gap-2">
                           <button onClick={() => setGuildTab('info')} className={`p-2 rounded ${guildTab === 'info' ? 'bg-indigo-600' : 'bg-slate-700'}`}>{getIcon("Users", "w-4 h-4")}</button>
                           <button onClick={() => setGuildTab('chat')} className={`p-2 rounded ${guildTab === 'chat' ? 'bg-indigo-600' : 'bg-slate-700'}`}>{getIcon("MessageSquare", "w-4 h-4")}</button>
                           <button onClick={() => setGuildTab('raid')} className={`p-2 rounded ${guildTab === 'raid' ? 'bg-red-600' : 'bg-slate-700'}`}>{getIcon("Skull", "w-4 h-4")}</button>
                       </div>
                   </div>

                   {/* Guild Content */}
                   <div className="flex-1 overflow-y-auto min-h-0 bg-slate-950/30 rounded-xl border border-slate-800 p-4">
                       
                       {guildTab === 'info' && (
                           <div className="space-y-3">
                               <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Membros</h3>
                               {Object.values(currentGuild.members).map((member: GuildMember) => (
                                   <div key={member.uid} className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
                                       <div className="flex items-center gap-3">
                                           <div className="w-8 h-8 bg-slate-700 rounded-full overflow-hidden">
                                               {member.avatar ? <img src={member.avatar} className="w-full h-full object-cover"/> : <div className="flex items-center justify-center h-full text-xs">?</div>}
                                           </div>
                                           <div>
                                               <div className="font-bold text-sm text-slate-200">{member.name}</div>
                                               <div className="text-[10px] text-blue-400 uppercase">{member.classTitle} • Lvl {member.level}</div>
                                           </div>
                                       </div>
                                       {member.role === 'leader' && <span className="text-yellow-500">{getIcon("Crown", "w-4 h-4")}</span>}
                                   </div>
                               ))}
                           </div>
                       )}

                       {guildTab === 'chat' && (
                           <div className="flex flex-col h-full">
                               <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                                   {chatMessages.map(msg => (
                                       <div key={msg.id} className={`flex flex-col ${msg.senderId === currentUser?.uid ? 'items-end' : 'items-start'}`}>
                                           <div className={`max-w-[80%] rounded-lg p-2 text-sm ${msg.type === 'system' ? 'bg-yellow-900/30 border border-yellow-800 text-yellow-200 w-full text-center' : msg.senderId === currentUser?.uid ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
                                               {msg.type !== 'system' && <span className="text-[10px] opacity-50 block mb-0.5">{msg.senderName}</span>}
                                               {msg.text}
                                           </div>
                                       </div>
                                   ))}
                                   <div ref={chatEndRef} />
                               </div>
                               <div className="mt-4 flex gap-2">
                                   <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white" placeholder="Mensagem..." />
                                   <button onClick={handleSendMessage} className="bg-indigo-600 p-2 rounded-lg">{getIcon("ChevronRight")}</button>
                               </div>
                           </div>
                       )}

                       {guildTab === 'raid' && currentGuild.boss && (
                           <div className="text-center space-y-6">
                               <div className="animate-pulse-slow">
                                   <div className="text-6xl mb-2">{currentGuild.boss.image}</div>
                                   <h3 className="text-2xl font-black text-red-500 uppercase tracking-widest">{currentGuild.boss.name}</h3>
                                   <p className="text-red-400 text-xs font-bold">Nível {currentGuild.boss.level}</p>
                               </div>
                               
                               <div className="relative pt-1 px-4">
                                    <div className="flex mb-2 items-center justify-between">
                                        <span className="text-xs font-bold text-red-200">{currentGuild.boss.currentHp} / {currentGuild.boss.maxHp} HP</span>
                                    </div>
                                    <div className="w-full bg-slate-900 rounded-full h-6 overflow-hidden border border-slate-700">
                                        <div
                                            className="h-full bg-gradient-to-r from-red-600 to-red-500 transition-all duration-300 ease-out"
                                            style={{ width: `${(currentGuild.boss.currentHp / currentGuild.boss.maxHp) * 100}%` }}
                                        ></div>
                                    </div>
                               </div>

                               <div className="bg-slate-900/50 p-4 rounded-xl border border-red-900/30">
                                   <p className="text-sm text-slate-300 mb-4">Realize exercícios de combate para causar dano!</p>
                                   <button onClick={handleAttackBoss} className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-red-900/20 active:scale-95 transition-transform">
                                       {getIcon("Swords", "w-5 h-5")} ATACAR (Gastar Energia)
                                   </button>
                                   <p className="text-[10px] text-slate-500 mt-2">Dano baseado no seu Nível ({gameState.level * 2} + 10)</p>
                               </div>
                           </div>
                       )}
                   </div>
               </div>
           ) : (
               <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div></div>
           )}
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

             <div className="relative mb-4">
                <div className="w-32 h-32 rounded-full border-4 border-slate-700 bg-slate-800 overflow-hidden shadow-2xl relative z-0">
                    <img src={getAvatarUrl} alt="Avatar Grande" className="w-full h-full object-cover" />
                </div>
                {isEditingProfile && (
                    <>
                        <input 
                            type="file" 
                            accept="image/*" 
                            ref={fileInputRef} 
                            onChange={handleImageUpload} 
                            className="hidden" 
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="absolute bottom-0 right-0 bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-full shadow-lg border border-slate-900 transition-colors z-20"
                        >
                            {getIcon("Camera", "w-5 h-5")}
                        </button>
                    </>
                )}
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
                <h3 className="text-center text-xs font-bold text-slate-500 uppercase mb-4">Atributos (Stats)</h3>
                <RadarChart attributes={gameState.attributes} />
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
