
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { UserProfile, GameState, ActivityLog, ACTIVITIES, ActivityType, Gender, Attribute, ATTRIBUTE_LABELS, Quest, BASIC_ACTIVITY_IDS, Guild, ChatMessage, GuildMember, RPG_CLASSES, PublicProfile, Duel } from './types';
import { getIcon } from './components/Icons';
import { generateRpgFlavorText, NarratorTrigger } from './services/geminiService';
import { auth, loginWithGoogle, logoutUser, saveUserDataToCloud, loadUserDataFromCloud, checkRedirectResult, createGuild, joinGuild, sendMessage, subscribeToGuild, attackBoss, registerWithEmail, loginWithEmail, getGlobalRanking, createDuel, fetchActiveDuels, acceptDuel, updateDuelProgress } from './firebase';
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
    id: 'common',
    label: 'Atividades Comuns',
    types: ['health'], // Inclui Água e Sono
    color: 'text-yellow-400',
    icon: 'Star'
  },
  { 
    id: 'physical', 
    label: 'Treino Físico', 
    types: ['fitness'], // Removed 'health'
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
  },
  {
    id: 'bad_habit',
    label: 'Hábitos Nocivos',
    types: ['bad_habit'],
    color: 'text-slate-400',
    icon: 'TriangleAlert'
  }
];

// --- Configuração de Atrofia (Dias até perder pontos) ---
const ATROPHY_THRESHOLDS: Record<Attribute, number> = {
    STR: 14, // 1-2 semanas (Força cai rápido)
    VIG: 14, // Cardio cai rápido
    INT: 14, // Foco mental (1-2 semanas)
    AGI: 18, // Coordenação (2-3 semanas)
    END: 21, // Massa muscular/Resistência (3 semanas)
    DEX: 25, // Luta/Mira (3-4 semanas)
    CHA: 21, // Criatividade (3-4 semanas)
    DRV: 30  // Direção (Longo prazo)
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
  const [isRankModalOpen, setIsRankModalOpen] = useState(false);
  
  // Profile Summary State
  const [summaryDate, setSummaryDate] = useState(new Date());

  const [selectedActivity, setSelectedActivity] = useState<ActivityType | null>(null);
  const [inputAmount, setInputAmount] = useState('');

  // --- Gym Workout State ---
  const [gymExercise, setGymExercise] = useState('');
  const [gymWeight, setGymWeight] = useState('');
  const [gymReps, setGymReps] = useState('');
  const [gymRestTime, setGymRestTime] = useState('02:00'); // Default 2 mins
  const [isResting, setIsResting] = useState(false);
  const [timerTimeLeft, setTimerTimeLeft] = useState(0);

  // --- Run Activity State ---
  const [runDistance, setRunDistance] = useState('');
  const [runDuration, setRunDuration] = useState(''); // MM:SS

  // --- Target Activities State (Shooting, Archery, Knife) ---
  const [targetTool, setTargetTool] = useState(''); // Weapon name (Curta, Recurvo, Faca Sem Giro)
  const [targetDistance, setTargetDistance] = useState('');
  const [targetHits, setTargetHits] = useState({ center: 0, c1: 0, c2: 0, c3: 0, outer: 0 });
  
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
  // Auth Views: 'login' (email/pass), 'register' (combined with character creation)
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
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

  // Ranking & PVP State
  const [rankingList, setRankingList] = useState<PublicProfile[]>([]);
  const [rankFilter, setRankFilter] = useState('Todos');
  const [viewingProfile, setViewingProfile] = useState<PublicProfile | null>(null);
  const [duels, setDuels] = useState<Duel[]>([]);
  
  // History UI State
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const hasNarratorRunRef = useRef(false);

  // Constants
  const XP_FOR_NEXT_LEVEL_BASE = 100;

  // --- Computed Memos ---

  // Generate unique exercise names for autocomplete
  const uniqueExercises = useMemo(() => {
    const exercises = new Set<string>();
    gameState.logs.forEach(log => {
        if (log.activityId === 'gym' && log.details?.exercise) {
            exercises.add(log.details.exercise);
        }
    });
    return Array.from(exercises).sort();
  }, [gameState.logs]);

  // Group logs by Activity ID for collapsible history
  const historyGroups = useMemo(() => {
    const groups: Record<string, ActivityLog[]> = {};
    gameState.logs.forEach(log => {
        if (!groups[log.activityId]) groups[log.activityId] = [];
        groups[log.activityId].push(log);
    });
    // Sort groups based on the timestamp of the LATEST log in that group
    return Object.entries(groups).sort(([, aLogs], [, bLogs]) => {
        return bLogs[0].timestamp - aLogs[0].timestamp; // Descending
    });
  }, [gameState.logs]);

  // --- Daily Summary Logic ---
  const dailySummary = useMemo(() => {
    const targetDate = summaryDate.toDateString();
    
    // 1. Filtrar logs do dia selecionado
    const logsForDay = gameState.logs.filter(log => new Date(log.timestamp).toDateString() === targetDate);
    
    // 2. Calcular XP total
    const totalXp = logsForDay.reduce((acc, log) => acc + log.xpGained, 0);

    // 3. Agrupar por atividade para exibição compacta
    const summaryList: { activity: ActivityType, count: number, totalAmount: number, details: string[] }[] = [];
    
    logsForDay.forEach(log => {
        const act = ACTIVITIES.find(a => a.id === log.activityId);
        if (!act) return;
        
        const existing = summaryList.find(s => s.activity.id === act.id);
        let detailStr = "";
        
        if (log.details?.exercise) detailStr = `${log.details.exercise} (${log.details.weight}kg)`;
        else if (log.details?.distance) detailStr = `${log.details.distance}km`;
        else if (log.details?.weapon) detailStr = log.details.weapon;
        
        if (existing) {
            existing.count += 1;
            existing.totalAmount += log.amount;
            if (detailStr) existing.details.push(detailStr);
        } else {
            summaryList.push({
                activity: act,
                count: 1,
                totalAmount: log.amount,
                details: detailStr ? [detailStr] : []
            });
        }
    });

    return { totalXp, list: summaryList, count: logsForDay.length };
  }, [gameState.logs, summaryDate]);

  const changeSummaryDate = (days: number) => {
      const newDate = new Date(summaryDate);
      newDate.setDate(newDate.getDate() + days);
      setSummaryDate(newDate);
  };

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
    const allClassActivities = ACTIVITIES.filter(a => !BASIC_ACTIVITY_IDS.includes(a.id) && a.category !== 'bad_habit'); // Exclui hábitos nocivos das quests

    // Determinar atividades de classe baseadas no arquétipo do jogador
    let filteredClassActivities = allClassActivities;
    
    if (currentClass.includes('Mago')) {
        filteredClassActivities = allClassActivities.filter(a => a.category === 'intellect');
    } else if (currentClass.includes('Healer') || currentClass.includes('Conselheiro')) {
        filteredClassActivities = allClassActivities.filter(a => a.category === 'social');
    } else if (currentClass === 'Motorista') {
        filteredClassActivities = allClassActivities.filter(a => a.id === 'drive');
    } else if (['Bodybuilder', 'Tanque', 'Lutador', 'Berseker', 'Guerreiro'].some(c => currentClass.includes(c))) {
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
        // Sleep removido da geração de quest

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

  // --- Helper: Calcular Bônus de IMC ---
  const calculateBmiBonus = (weight: number, height: number): number => {
    if (weight <= 0 || height <= 0) return 0;
    const heightM = height / 100;
    const bmi = weight / (heightM * heightM);

    if (bmi > 40.0) return 20; // Obesidade III - Tankiness extremo
    if (bmi >= 30.0) return 15; // Obesidade I/II
    if (bmi >= 25.0) return 10; // Sobrepeso
    if (bmi >= 23.41) return 5; // "Gordinho" / Normal Alto
    return 0; // Abaixo de 23.41 não ganha bônus de resistência passiva
  };

  // --- LÓGICA DE ATROFIA DE ATRIBUTOS ---
  const applyAtrophySystem = (state: GameState): { newState: GameState, lostAttributes: string[] } => {
    const now = Date.now();
    const lastCheck = state.lastAtrophyCheck || 0;
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    // Só roda o check 1 vez a cada 24h
    if (now - lastCheck < ONE_DAY_MS) return { newState: state, lostAttributes: [] };

    const newAttributes = { ...state.attributes };
    const lostAttrs: string[] = [];

    // Calcular a última vez que cada atributo foi treinado
    const lastTrained: Record<string, number> = {};
    
    // Inicializar com 0 ou data de criação do log
    const attributeKeys = Object.keys(newAttributes) as Attribute[];
    attributeKeys.forEach(attr => lastTrained[attr] = 0);

    // Varrer logs (do mais recente pro mais antigo)
    for (const log of state.logs) {
        const act = ACTIVITIES.find(a => a.id === log.activityId);
        if (act) {
            // Se a atividade usa o atributo, atualiza o timestamp se for mais recente
            if (act.primaryAttribute && log.timestamp > (lastTrained[act.primaryAttribute] || 0)) {
                lastTrained[act.primaryAttribute] = log.timestamp;
            }
            if (act.secondaryAttribute && log.timestamp > (lastTrained[act.secondaryAttribute] || 0)) {
                lastTrained[act.secondaryAttribute] = log.timestamp;
            }
        }
    }

    // Verificar Limiares
    attributeKeys.forEach(attr => {
        const lastTime = lastTrained[attr];
        // Se nunca treinou (0), assumimos que não atrofia ainda ou pega data atual para dar chance
        // Vamos considerar que se é 0, o jogador é novo, então "agora" é o last time.
        const effectiveLastTime = lastTime === 0 ? now : lastTime;
        
        const daysSince = (now - effectiveLastTime) / ONE_DAY_MS;
        const threshold = ATROPHY_THRESHOLDS[attr];

        if (daysSince > threshold) {
            if (newAttributes[attr] > 0) {
                newAttributes[attr] = Math.max(0, newAttributes[attr] - 1);
                lostAttrs.push(attr);
            }
        }
    });

    return {
        newState: {
            ...state,
            attributes: newAttributes,
            lastAtrophyCheck: now
        },
        lostAttributes: lostAttrs
    };
  };

  // Helper para labels de data no histórico
  const getDayLabel = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
    const check = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

    if (check === today) return "Hoje";
    if (check === yesterday) return "Ontem";
    return date.toLocaleDateString();
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
        
        let loadedState: GameState = { 
            ...parsedGame,
            classTitle: currentClass,
            attributes: safeAttributes,
            quests: quests,
            lastDailyQuestGen: lastDaily,
            lastWeeklyQuestGen: lastWeekly
        };

        // --- ATROPHY CHECK (LOCAL LOAD) ---
        const { newState, lostAttributes } = applyAtrophySystem(loadedState);
        loadedState = newState;
        
        if (lostAttributes.length > 0) {
            setNarratorText(`A inatividade cobrou seu preço. Você sente seus atributos diminuírem: ${lostAttributes.join(', ')} (-1)`);
        }

        setGameState(loadedState);

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
                const u = cloudData.userProfile;
                setUser(u);
                
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

                let newState: GameState = { 
                    ...cloudGame,
                    attributes: safeAttributes,
                    quests,
                    lastDailyQuestGen: lastDaily,
                    lastWeeklyQuestGen: lastWeekly
                };

                // --- ATROPHY CHECK (CLOUD LOAD) ---
                const { newState: atrophiedState, lostAttributes } = applyAtrophySystem(newState);
                newState = atrophiedState;
                
                if (lostAttributes.length > 0) {
                     setNarratorText(`A inatividade cobrou seu preço. Você sente seus atributos diminuírem: ${lostAttributes.join(', ')} (-1)`);
                }

                setGameState(newState); 

                if (cloudGame.guildId) {
                    subscribeToGuild(cloudGame.guildId, (guild, messages) => {
                        setCurrentGuild(guild);
                        if (messages) setChatMessages(messages);
                    });
                }

                // Start Listening to Duels
                fetchActiveDuels(firebaseUser.uid, (activeDuels) => {
                    setDuels(activeDuels);
                });

                // --- NARRATOR LOGIN TRIGGER ---
                // Only trigger once per session load
                if (!hasNarratorRunRef.current && lostAttributes.length === 0) { // Don't overwrite Atrophy message if it happened
                    hasNarratorRunRef.current = true;
                    updateNarrator(u, newState, undefined, 'login');
                }

              } else {
                  if (savedUser && savedGame) {
                      await saveUserDataToCloud(firebaseUser.uid, JSON.parse(savedUser), JSON.parse(savedGame));
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        await loginWithEmail(authEmail, authPassword);
    } catch (e: any) {
        let msg = e.message;
        if (e.code === 'auth/invalid-credential') msg = "E-mail ou senha incorretos.";
        alert(msg);
    }
  };

  // UNIFIED REGISTER + ONBOARDING FUNCTION
  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      
      // 1. Validar Senhas
      if (authPassword !== authConfirmPassword) {
          alert("As senhas não conferem!");
          return;
      }
      if (authPassword.length < 6) {
          alert("A senha deve ter pelo menos 6 caracteres.");
          return;
      }

      const formData = new FormData(e.currentTarget);
      const name = formData.get('name') as string;
      const gender = formData.get('gender') as Gender;
      const dob = formData.get('dob') as string;
      const profession = formData.get('profession') as string;
      const weight = Number(formData.get('weight'));
      const height = Number(formData.get('height'));
      
      try {
          // 2. Criar Conta no Firebase
          const firebaseUser = await registerWithEmail(authEmail, authPassword);
          
          // 3. Gerar Perfil
          const newUser: UserProfile = {
              name,
              dob,
              weight,
              height,
              gender,
              profession
          };

          // 4. Gerar GameState Inicial (com bonus de BMI)
          const bmiBonus = calculateBmiBonus(weight, height);
          const initialAttributes = { ...gameState.attributes };
          if (bmiBonus > 0) {
              initialAttributes.END = bmiBonus;
          }
          
          const newGameState: GameState = {
              ...gameState,
              attributes: initialAttributes
          };

          // 5. Salvar Tudo na Nuvem e Local
          setUser(newUser);
          setGameState(newGameState);
          setCurrentUser(firebaseUser); // Força atualização local imediata
          
          await saveUserDataToCloud(firebaseUser.uid, newUser, newGameState);
          
          // 6. Narrador Login (First Time)
          updateNarrator(newUser, newGameState, undefined, 'login');

      } catch (e: any) {
          let msg = e.message;
          if (e.code === 'auth/email-already-in-use') msg = "Este e-mail já está cadastrado.";
          if (e.code === 'auth/weak-password') msg = "A senha é muito fraca.";
          alert("Erro ao criar conta: " + msg);
      }
  };

  const handleLogout = async () => {
    await logoutUser();
    
    // Clear Local Storage to prevent data bleeding
    localStorage.removeItem('liferpg_user');
    localStorage.removeItem('liferpg_game');
    localStorage.removeItem('liferpg_needs_sync');
    
    // Reset All State
    setUser(null);
    setCurrentUser(null);
    setGameState({
        level: 1,
        currentXp: 0,
        totalXp: 0,
        logs: [],
        classTitle: "NPC",
        attributes: { STR: 0, END: 0, VIG: 0, AGI: 0, DEX: 0, INT: 0, CHA: 0, DRV: 0 }, 
        activeBuff: null,
        quests: [],
        guildId: undefined
    });
    setCurrentGuild(null);
    setChatMessages([]);
    setAuthView('login');
    setNarratorText("Até a próxima jornada.");
  };

  const calculateXpForNextLevel = (level: number) => {
    return level * XP_FOR_NEXT_LEVEL_BASE;
  };

  // --- LÓGICA DE CLASSES BASEADA EM ATRIBUTOS, IMC E HISTÓRICO ---
  const determineClass = (attrs: Record<Attribute, number>, weight: number, height: number, logs: ActivityLog[]): string => {
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
      
      // Calcular IMC
      const heightM = height / 100;
      const bmi = weight > 0 && height > 0 ? weight / (heightM * heightM) : 22;

      // Analisar Histórico Recente (Últimos 50 logs)
      let combatCount = 0;
      let fitnessCount = 0;
      logs.slice(0, 50).forEach(log => {
          const act = ACTIVITIES.find(a => a.id === log.activityId);
          if (act?.category === 'combat') combatCount++;
          if (act?.category === 'fitness') fitnessCount++;
      });

      switch (maxAttr) {
          case 'STR': // Força Dominante
              // Se for pesado (> 28 IMC) e tiver resistencia, é Tanque
              if (bmi >= 28 && isSecondaryRelevant && secondMaxAttr === 'END') return "Tanque"; 
              if (bmi >= 28 && !isSecondaryRelevant) return "Tanque"; // Tanque de força pura (Powerlifter)

              // Se tiver IMC Normal/Baixo
              if (isSecondaryRelevant && secondMaxAttr === 'DEX') return "Lutador";
              if (isSecondaryRelevant && secondMaxAttr === 'AGI') return "Berseker";
              
              // Diferenciação por Atividade: Guerreiro (Fitness) vs Lutador (Combate) vs Bodybuilder (Pura Estética)
              if (combatCount > fitnessCount) return "Lutador";
              if (fitnessCount > combatCount) return "Guerreiro";
              
              return "Guerreiro"; // Default para STR sem secondary relevante e IMC normal
          
          case 'VIG': // Vigor Dominante (Cardio) - Antigo END
              if (isSecondaryRelevant && secondMaxAttr === 'STR') return "Biker"; 
              if (isSecondaryRelevant && secondMaxAttr === 'AGI') return "Corredor"; // Ou Triatleta
              return "Corredor";

          case 'END': // Resistência Muscular Dominante
               if (isSecondaryRelevant && secondMaxAttr === 'STR') {
                   // Se for pesado com muita resistência
                   if (bmi >= 28) return "Tanque";
                   return "Crossfitter"; // Alta Repetição + Força + IMC Normal
               }
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

  const handleUpdateProfile = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const newWeight = Number(formData.get('weight'));
    const newHeight = Number(formData.get('height'));

    // Calcular diferença de Bônus de IMC
    const oldBonus = calculateBmiBonus(user.weight, user.height);
    const newBonus = calculateBmiBonus(newWeight, newHeight);
    const bonusDiff = newBonus - oldBonus;

    const updatedUser: UserProfile = {
        ...user,
        weight: newWeight,
        height: newHeight,
        gender: formData.get('gender') as Gender,
        profession: formData.get('profession') as string,
    };
    
    // Atualizar atributos se houve mudança no tier de IMC
    if (bonusDiff !== 0) {
        setGameState(prev => ({
            ...prev,
            attributes: {
                ...prev.attributes,
                END: Math.max(0, (prev.attributes.END || 0) + bonusDiff)
            }
        }));
    }

    // Reavaliar Classe com novos dados físicos
    const newClassTitle = determineClass(gameState.attributes, newWeight, newHeight, gameState.logs);

    setUser(updatedUser);
    setGameState(prev => ({
        ...prev,
        classTitle: newClassTitle
    }));

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

  const updateNarrator = async (u: UserProfile, g: GameState, activityName?: string, trigger: NarratorTrigger = 'activity') => {
    if (!isOnline) {
        if (trigger === 'login') setNarratorText("Bem-vindo ao modo offline. Sua jornada continua!");
        else setNarratorText("Atividade registrada localmente.");
        return;
    }
    
    setLoadingAi(true);
    try {
      const text = await generateRpgFlavorText(u, g, trigger, activityName);
      setNarratorText(text);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAi(false);
    }
  };

  const handleLogActivity = async () => {
    if (!selectedActivity || !user) return;

    let amount = 0;
    let xpGained = 0;
    let details: ActivityLog['details'] | undefined = undefined;

    const newAttributes = { ...gameState.attributes };
    
    // --- Lógica de Hábitos Nocivos (Debuffs) ---
    if (selectedActivity.category === 'bad_habit') {
        const now = Date.now();
        let buffMultiplier = 1;
        let buffDurationHours = 0;
        let debuffName = "";

        if (selectedActivity.id === 'alcohol') {
            buffMultiplier = 0.5; // -50% XP
            buffDurationHours = 12;
            debuffName = "Ressaca";
        } else if (selectedActivity.id === 'smoke') {
            buffMultiplier = 0.7; // -30% XP
            buffDurationHours = 4;
            debuffName = "Fôlego Curto";
        } else if (selectedActivity.id === 'junk_food') {
            buffMultiplier = 0.8; // -20% XP
            buffDurationHours = 3;
            debuffName = "Digestão Pesada";
        }

        const expireDate = now + (buffDurationHours * 60 * 60 * 1000);
        
        setGameState(prev => ({
            ...prev,
            activeBuff: {
                multiplier: buffMultiplier,
                expiresAt: expireDate,
                description: `${debuffName}: ${Math.round((buffMultiplier - 1) * 100)}% XP`
            }
        }));
        
        // Log simples sem XP
        amount = Number(inputAmount) || 1;
        xpGained = 0;
        
        // Registrar e sair
        const newLog: ActivityLog = {
            id: Date.now().toString(),
            activityId: selectedActivity.id,
            amount,
            xpGained,
            timestamp: Date.now()
        };
        
        setGameState(prev => ({
            ...prev,
            logs: [newLog, ...prev.logs].slice(0, 50),
            // activeBuff já foi setado acima
        }));
        
        setIsActivityModalOpen(false);
        setNarratorText(`Hábito nocivo registrado. Você sofre de ${debuffName} por ${buffDurationHours} horas.`);
        return;
    }

    // --- Lógica Especial para Musculação ---
    if (selectedActivity.id === 'gym') {
        const weight = Number(gymWeight) || 0;
        const reps = Number(gymReps) || 0;
        if (reps <= 0) return;

        amount = 1; // 1 série
        const effectiveWeight = weight > 0 ? weight : 10;
        xpGained = Math.floor((effectiveWeight * reps) / 5) + 5; 

        details = {
            exercise: gymExercise || 'Exercício',
            weight: weight,
            reps: reps,
            restTime: 0
        };

        const attributePoints = Math.ceil(xpGained / 5);

        if (reps <= 6) {
            newAttributes.STR = (newAttributes.STR || 0) + attributePoints;
            newAttributes.END = (newAttributes.END || 0) + Math.ceil(attributePoints * 0.5);
        } else if (reps >= 7 && reps <= 9) {
            newAttributes.STR = (newAttributes.STR || 0) + Math.ceil(attributePoints * 0.7);
            newAttributes.END = (newAttributes.END || 0) + Math.ceil(attributePoints * 0.7);
        } else {
            newAttributes.END = (newAttributes.END || 0) + attributePoints;
            newAttributes.STR = (newAttributes.STR || 0) + Math.ceil(attributePoints * 0.5);
        }

        const [mins, secs] = gymRestTime.split(':').map(Number);
        const totalSecs = (mins * 60) + secs;
        if (totalSecs > 0) {
            setTimerTimeLeft(totalSecs);
            setIsResting(true);
        }
    } else if (selectedActivity.id === 'run') {
        // --- Lógica Especial para Corrida (Pace) ---
        const distance = Number(runDistance) || 0;
        if (distance <= 0) return;
        
        // Parse duration from MM:SS
        const [minsStr, secsStr] = runDuration.split(':');
        const totalMinutes = (Number(minsStr) || 0) + ((Number(secsStr) || 0) / 60);
        
        if (totalMinutes <= 0) return;

        amount = distance;
        const pace = totalMinutes / distance; // Minutos por Km
        
        // XP Base
        let baseXp = Math.floor(distance * selectedActivity.xpPerUnit);
        
        // Multiplicador de Pace
        let paceMultiplier = 1;
        let paceLabel = "Normal";

        if (pace <= 3.75) { // 3:45/km = 3.75 min/km
            paceMultiplier = 1.5; // Elite
            paceLabel = "Elite";
        } else if (pace <= 4.5) { // 4:30/km = 4.5 min/km
            paceMultiplier = 1.2; // Atleta
            paceLabel = "Rápido";
        }

        xpGained = Math.floor(baseXp * paceMultiplier);

        // Format pace string for display (MM:SS)
        const paceMins = Math.floor(pace);
        const paceSecs = Math.round((pace - paceMins) * 60);
        const paceString = `${paceMins}:${paceSecs.toString().padStart(2, '0')}`;

        details = {
            distance: distance,
            duration: runDuration,
            pace: `${paceString} /km`
        };

        // Atributos (Corrida foca em VIG e AGI se for rápido)
        const pointsEarned = Math.ceil(amount * paceMultiplier);
        newAttributes.VIG = (newAttributes.VIG || 0) + pointsEarned;
        
        if (pace <= 4.5) { // Se for atleta/elite (4:30 ou menos)
             newAttributes.AGI = (newAttributes.AGI || 0) + Math.ceil(pointsEarned * 0.7);
        } else {
             newAttributes.AGI = (newAttributes.AGI || 0) + Math.ceil(pointsEarned * 0.3);
        }

    } else if (selectedActivity.id === 'shooting' || selectedActivity.id === 'archery' || selectedActivity.id === 'knife_throw') {
        // --- Lógica Unificada para Tiro, Arco e Faca ---
        const dist = Number(targetDistance) || 0;
        const totalShots = targetHits.center + targetHits.c1 + targetHits.c2 + targetHits.c3 + targetHits.outer;
        
        if (totalShots <= 0 || dist <= 0) return;

        // Calcular Score Bruto
        const rawScore = (targetHits.center * 10) + (targetHits.c1 * 5) + (targetHits.c2 * 3) + (targetHits.c3 * 2) + (targetHits.outer * 1);
        
        // Fator de Distância (Baseado na Ferramenta/Arma)
        let distanceFactor = 1;
        const tool = targetTool.toLowerCase();

        if (selectedActivity.id === 'shooting') {
            if (tool === 'curta') distanceFactor = 1 + (dist / 10);
            else if (tool === 'espingarda') distanceFactor = 1 + (dist / 25);
            else distanceFactor = 1 + (dist / 50); // Longa/Rifle
        } else if (selectedActivity.id === 'archery') {
            // Arcos
            if (tool === 'composto') distanceFactor = 1 + (dist / 30);
            else if (tool === 'recurvo') distanceFactor = 1.2 + (dist / 20); // Mais difícil
            else if (tool === 'longbow') distanceFactor = 1.5 + (dist / 20); // Muito difícil
            else if (tool === 'besta') distanceFactor = 1 + (dist / 40); // Fácil
        } else if (selectedActivity.id === 'knife_throw') {
            // Facas (Distâncias menores)
            if (dist <= 3) distanceFactor = 1;
            else distanceFactor = 1 + (dist / 3); // Cada 3m aumenta muito a dificuldade
        }

        xpGained = Math.ceil(rawScore * distanceFactor * 0.2); 
        if (selectedActivity.id === 'knife_throw') xpGained = Math.ceil(xpGained * 1.2); // Bonus por ser difícil
        
        amount = 1; // 1 sessão

        details = {
            weapon: targetTool,
            distance: dist,
            hits: { ...targetHits }
        };

        const attrPoints = Math.ceil(xpGained / 3);
        
        if (selectedActivity.id === 'shooting') {
             newAttributes.DEX = (newAttributes.DEX || 0) + attrPoints; 
             if (tool === 'curta' || tool === 'longa') newAttributes.INT = (newAttributes.INT || 0) + Math.ceil(attrPoints * 0.5);
             else newAttributes.STR = (newAttributes.STR || 0) + Math.ceil(attrPoints * 0.5);
        } else if (selectedActivity.id === 'archery') {
             newAttributes.DEX = (newAttributes.DEX || 0) + attrPoints; 
             // Arco exige força para puxar
             newAttributes.STR = (newAttributes.STR || 0) + Math.ceil(attrPoints * 0.6);
        } else if (selectedActivity.id === 'knife_throw') {
             newAttributes.DEX = (newAttributes.DEX || 0) + attrPoints;
             // Faca exige Agilidade/Fluidez
             newAttributes.AGI = (newAttributes.AGI || 0) + Math.ceil(attrPoints * 0.5);
        }

    } else {
        // Lógica Padrão para outras atividades
        if (!inputAmount || isNaN(Number(inputAmount))) return;
        amount = Number(inputAmount);
        xpGained = Math.floor(amount * selectedActivity.xpPerUnit);

        let pointsEarned = Math.ceil(amount);

        // Ajuste específico para Dirigir: 50km = 1 Ponto de Atributo
        if (selectedActivity.id === 'drive') {
             pointsEarned = Math.floor(amount / 50);
        }

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
    
    // Lista de logs atualizada para passar para determineClass
    const updatedLogs = [newLog, ...gameState.logs].slice(0, 50);

    const newClassTitle = determineClass(newAttributes, user.weight, user.height, updatedLogs);

    const activeBuff = (gameState.activeBuff && Date.now() < gameState.activeBuff.expiresAt) 
        ? gameState.activeBuff 
        : null;

    const newState = {
      ...gameState,
      level: newLevel,
      currentXp: newCurrentXp,
      totalXp: newTotalXp,
      logs: updatedLogs,
      attributes: newAttributes,
      classTitle: newClassTitle,
      activeBuff: activeBuff,
      quests: updatedQuests
    };

    setGameState(newState);
    
    // Update PVP Duel Progress
    if (currentUser) {
        updateDuelProgress(currentUser.uid, selectedActivity.id, amount);
    }
    
    // Só fecha o modal se não for Gym (pois Gym tem o timer)
    if (selectedActivity.id !== 'gym') {
        setIsActivityModalOpen(false);
        setInputAmount('');
        setRunDistance('');
        setRunDuration('');
        setTargetDistance('');
        setTargetHits({ center: 0, c1: 0, c2: 0, c3: 0, outer: 0 });
        setSelectedActivity(null);
    }
    
    if (leveledUp) {
      setShowLevelUp(true);
      setTimeout(() => setShowLevelUp(false), 5000);
      updateNarrator(user!, newState, "LEVEL UP", 'level_up');
    } else {
        if (selectedActivity.id !== 'gym') {
             updateNarrator(user!, newState, selectedActivity.label + (buffApplied ? " (Buffado)" : ""), 'activity');
        }
    }
  };

  const handleDeleteLog = (logId: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este registro? Os pontos e XP serão removidos.")) return;

    const logToDelete = gameState.logs.find(l => l.id === logId);
    if (!logToDelete || !user) return;

    // 1. Remover XP
    let newTotalXp = Math.max(0, gameState.totalXp - logToDelete.xpGained);
    
    // 2. Recalcular Nível
    let newLevel = 1;
    let xpAccumulator = 0;
    let xpForNext = calculateXpForNextLevel(1);
    while (xpAccumulator + xpForNext <= newTotalXp) {
        xpAccumulator += xpForNext;
        newLevel++;
        xpForNext = calculateXpForNextLevel(newLevel);
    }
    let newCurrentXp = newTotalXp - xpAccumulator;

    // 3. Reverter Atributos (Lógica Inversa)
    const newAttributes = { ...gameState.attributes };
    const act = ACTIVITIES.find(a => a.id === logToDelete.activityId);

    if (act) {
        if (act.id === 'gym' && logToDelete.details) {
            const { reps, weight } = logToDelete.details;
            const xp = logToDelete.xpGained; 
            // Note: xpGained was calculated with floor/ceil logic, so we approximate the attribute points removal
            const attrPoints = Math.ceil(xp / 5);
            const r = reps || 0;

            if (r <= 6) {
                newAttributes.STR = Math.max(0, (newAttributes.STR || 0) - attrPoints);
                newAttributes.END = Math.max(0, (newAttributes.END || 0) - Math.ceil(attrPoints * 0.5));
            } else if (r >= 7 && r <= 9) {
                newAttributes.STR = Math.max(0, (newAttributes.STR || 0) - Math.ceil(attrPoints * 0.7));
                newAttributes.END = Math.max(0, (newAttributes.END || 0) - Math.ceil(attrPoints * 0.7));
            } else {
                newAttributes.END = Math.max(0, (newAttributes.END || 0) - attrPoints);
                newAttributes.STR = Math.max(0, (newAttributes.STR || 0) - Math.ceil(attrPoints * 0.5));
            }
        } else if (act.id === 'run' && logToDelete.details) {
            // Revert Run Logic
            // We know xpGained. We need to estimate Pace Multiplier to revert attributes.
            // But we have pointsEarned logic based on amount * multiplier.
            // Let's use details to reconstruct multiplier.
            const distance = logToDelete.amount;
            const [m, s] = (logToDelete.details.duration || "0:00").split(':').map(Number);
            const totalMin = (m||0) + ((s||0)/60);
            const pace = distance > 0 ? totalMin/distance : 10;
            
            let paceMultiplier = 1;
            if (pace <= 3.75) paceMultiplier = 1.5;
            else if (pace <= 4.5) paceMultiplier = 1.2;
            
            const pointsEarned = Math.ceil(distance * paceMultiplier);
            newAttributes.VIG = Math.max(0, (newAttributes.VIG || 0) - pointsEarned);

            if (pace <= 4.5) newAttributes.AGI = Math.max(0, (newAttributes.AGI || 0) - Math.ceil(pointsEarned * 0.7));
            else newAttributes.AGI = Math.max(0, (newAttributes.AGI || 0) - Math.ceil(pointsEarned * 0.3));

        } else if (['shooting', 'archery', 'knife_throw'].includes(act.id)) {
             const xp = logToDelete.xpGained;
             const attrPoints = Math.ceil(xp / 3);
             
             if (act.id === 'shooting') {
                 newAttributes.DEX = Math.max(0, (newAttributes.DEX || 0) - attrPoints);
                 const tool = logToDelete.details?.weapon || '';
                 if (tool === 'curta' || tool === 'longa') newAttributes.INT = Math.max(0, (newAttributes.INT || 0) - Math.ceil(attrPoints * 0.5));
                 else newAttributes.STR = Math.max(0, (newAttributes.STR || 0) - Math.ceil(attrPoints * 0.5));
             } else if (act.id === 'archery') {
                 newAttributes.DEX = Math.max(0, (newAttributes.DEX || 0) - attrPoints);
                 newAttributes.STR = Math.max(0, (newAttributes.STR || 0) - Math.ceil(attrPoints * 0.6));
             } else if (act.id === 'knife_throw') {
                 newAttributes.DEX = Math.max(0, (newAttributes.DEX || 0) - attrPoints);
                 newAttributes.AGI = Math.max(0, (newAttributes.AGI || 0) - Math.ceil(attrPoints * 0.5));
             }
        } else {
             // Standard Logic
             let pointsEarned = Math.ceil(logToDelete.amount);
             if (act.id === 'drive') pointsEarned = Math.floor(logToDelete.amount / 50);

             if (act.primaryAttribute) {
                 newAttributes[act.primaryAttribute] = Math.max(0, (newAttributes[act.primaryAttribute] || 0) - pointsEarned);
             }
             if (act.secondaryAttribute) {
                 newAttributes[act.secondaryAttribute] = Math.max(0, (newAttributes[act.secondaryAttribute] || 0) - Math.ceil(pointsEarned * 0.5));
             }
        }
    }

    // 4. Reverter Progresso de Quest (Apenas se não foi coletada)
    const updatedQuests = gameState.quests.map(q => {
        if (!q.isClaimed && q.activityId === logToDelete.activityId) {
            return {
                ...q,
                currentAmount: Math.max(0, q.currentAmount - logToDelete.amount)
            };
        }
        return q;
    });

    // 5. Remover Log
    const updatedLogs = gameState.logs.filter(l => l.id !== logId);
    
    // 6. Recalcular Classe
    const newClassTitle = determineClass(newAttributes, user.weight, user.height, updatedLogs);

    setGameState(prev => ({
        ...prev,
        level: newLevel,
        currentXp: newCurrentXp,
        totalXp: newTotalXp,
        logs: updatedLogs,
        attributes: newAttributes,
        quests: updatedQuests,
        classTitle: newClassTitle
    }));

    setNarratorText("Registro removido. O tempo volta atrás...");
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
        // Atualiza a missão de sono se ela existir (apenas se existir quest, mas nao gera nova)
        quests: prev.quests.map(q => q.activityId === 'sleep' && !q.isClaimed ? { ...q, currentAmount: q.currentAmount + 1 } : q),
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

  const handleLoadRanking = async () => {
      if (!isOnline) {
          alert("Precisa estar online para ver o Ranking.");
          return;
      }
      const list = await getGlobalRanking(rankFilter);
      setRankingList(list);
  };
  
  useEffect(() => {
      if (isRankModalOpen) {
          handleLoadRanking();
      }
  }, [isRankModalOpen, rankFilter]);

  const handleChallenge = async (opponent: PublicProfile) => {
      if (!currentUser || !user) return;
      // Exemplo fixo: Desafio de 50 flexoes
      const act = ACTIVITIES.find(a => a.id === 'pushup');
      if (!act) return;
      
      await createDuel(currentUser.uid, user.name, opponent.uid, opponent.name, 'pushup', 50);
  };
  
  const handleAcceptDuel = async (duel: Duel) => {
      await acceptDuel(duel.id);
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
  const isDebuff = isBuffActive && gameState.activeBuff!.multiplier < 1;
  
  const xpNeeded = calculateXpForNextLevel(gameState.level);

  // Filtragem e Ordenação de Quests
  const dailyQuests = gameState.quests.filter(q => q.type === 'daily');
  
  // Separar Quests Básicas (Sem atributo ou Sono) de Avançadas
  // ORDENAÇÃO EXPLÍCITA: Sono vem primeiro
  const basicDailyQuests = dailyQuests.filter(q => {
      const act = ACTIVITIES.find(a => a.id === q.activityId);
      return q.activityId === 'sleep' || (act && !act.primaryAttribute);
  }).sort((a, b) => {
      if (a.activityId === 'sleep') return -1;
      if (b.activityId === 'sleep') return 1;
      return 0;
  });
  
  const advancedDailyQuests = dailyQuests.filter(q => {
      const act = ACTIVITIES.find(a => a.id === q.activityId);
      return q.activityId !== 'sleep' && (act && !!act.primaryAttribute);
  });

  const weeklyQuests = gameState.quests.filter(q => q.type === 'weekly');
  const unclaimedQuestsCount = gameState.quests.filter(q => q.currentAmount >= q.targetAmount && !q.isClaimed).length;

  // --- Run Pace Calculator ---
  const currentPace = useMemo(() => {
      if (!runDistance || !runDuration) return "0:00";
      const d = Number(runDistance);
      const [m, s] = runDuration.split(':').map(Number);
      const totalMin = (m || 0) + ((s || 0) / 60);
      if (d <= 0 || totalMin <= 0) return "0:00";
      const p = totalMin / d;
      const pM = Math.floor(p);
      const pS = Math.round((p - pM) * 60);
      return `${pM}:${pS.toString().padStart(2, '0')}`;
  }, [runDistance, runDuration]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500 mb-2">LifeRPG</h1>
            <p className="text-slate-400 text-sm">Gamifique sua Evolução</p>
          </div>

          <div className="bg-slate-900/80 p-6 rounded-2xl shadow-xl border border-slate-800 backdrop-blur-sm">
            
            {/* Abas de Navegação Auth simplificadas */}
            <div className="flex border-b border-slate-700 mb-6">
                <button onClick={() => setAuthView('login')} className={`flex-1 pb-2 text-sm font-bold uppercase transition-colors ${authView === 'login' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
                    Já tenho conta
                </button>
                <button onClick={() => setAuthView('register')} className={`flex-1 pb-2 text-sm font-bold uppercase transition-colors ${authView === 'register' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
                    Criar Nova Jornada
                </button>
            </div>

            {authView === 'login' ? (
                <form onSubmit={handleLogin} className="space-y-4 animate-fade-in">
                     <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">E-mail</label>
                        <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="seu@email.com" />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Senha</label>
                        <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="******" />
                     </div>
                     <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors">
                         Entrar
                     </button>
                     
                     <div className="flex items-center gap-4 before:h-px before:flex-1 before:bg-slate-700 after:h-px after:flex-1 after:bg-slate-700">
                       <span className="text-slate-500 text-xs font-bold uppercase">OU</span>
                     </div>
                     
                     <button type="button" onClick={handleGoogleLogin} className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                         {getIcon("User", "w-4 h-4")} Continuar com Google
                     </button>
                </form>
            ) : (
                <form onSubmit={handleRegister} className="space-y-4 animate-fade-in">
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50 mb-4">
                        <h3 className="text-xs font-bold text-indigo-400 uppercase mb-3 border-b border-indigo-500/30 pb-1">Dados do Herói</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nome do Herói</label>
                                <input name="name" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: Aragorn" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Gênero</label>
                                <select name="gender" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none">
                                    <option value="Masculino">Masculino</option>
                                    <option value="Feminino">Feminino</option>
                                    <option value="Outros">Outros</option>
                                </select>
                                </div>
                                <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Data Nasc.</label>
                                <input type="date" name="dob" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Profissão (Vida Real)</label>
                                <input name="profession" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: Programador..." />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Peso (kg)</label>
                                    <input type="number" name="weight" step="0.1" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Altura (cm)</label>
                                    <input type="number" name="height" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                        <h3 className="text-xs font-bold text-emerald-400 uppercase mb-3 border-b border-emerald-500/30 pb-1">Dados de Acesso</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">E-mail</label>
                                <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="seu@email.com" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Senha</label>
                                    <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="******" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Confirmar</label>
                                    <input 
                                        type="password" 
                                        value={authConfirmPassword} 
                                        onChange={e => setAuthConfirmPassword(e.target.value)} 
                                        required 
                                        className={`w-full bg-slate-950 border rounded-lg p-2 text-white focus:ring-2 outline-none ${authPassword && authConfirmPassword && authPassword !== authConfirmPassword ? 'border-red-500 focus:ring-red-500' : 'border-slate-700 focus:ring-blue-500'}`} 
                                        placeholder="******" 
                                    />
                                </div>
                            </div>
                             {authPassword && authConfirmPassword && authPassword !== authConfirmPassword && (
                                <p className="text-red-500 text-xs font-bold text-center">As senhas não conferem!</p>
                            )}
                        </div>
                    </div>

                    <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/20 mt-4">
                        Iniciar Jornada
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
                  {isBuffActive && <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border border-slate-900 ${isDebuff ? 'bg-red-600 animate-pulse' : 'bg-purple-600'}`}></div>}
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
                   <button onClick={(e) => { e.stopPropagation(); setIsRankModalOpen(true); }} className="relative text-[10px] bg-yellow-900/40 text-yellow-400 border border-yellow-700/50 px-2 py-1 rounded flex items-center gap-1 hover:bg-yellow-900/60 transition-colors">
                        {getIcon("Globe", "w-3 h-3")} Rank
                   </button>
                   <button onClick={(e) => { e.stopPropagation(); setIsGuildModalOpen(true); }} className="relative text-[10px] bg-indigo-900/40 text-indigo-400 border border-indigo-700/50 px-2 py-1 rounded flex items-center gap-1 hover:bg-indigo-900/60 transition-colors">
                        {getIcon("Shield", "w-3 h-3")} Clã
                   </button>
                   <button onClick={(e) => { e.stopPropagation(); setIsQuestModalOpen(true); }} className="relative text-[10px] bg-amber-900/40 text-amber-400 border border-amber-700/50 px-2 py-1 rounded flex items-center gap-1 hover:bg-amber-900/60 transition-colors">
                        {getIcon("Scroll", "w-3 h-3")} Quests
                        {unclaimedQuestsCount > 0 && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>}
                   </button>
                   {currentUser ? (
                      <div className="flex gap-2">
                        {/* Status Indicator */}
                        {isSyncing ? (
                            <div className="text-[10px] text-blue-400 border border-blue-800 px-2 py-1 rounded flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-full animate-spin"></div></div>
                        ) : isOnline ? (
                            <div className="text-[10px] text-emerald-400 border border-emerald-800 px-2 py-1 rounded flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-full"></div></div>
                        ) : (
                            <div className="text-[10px] text-red-400 border border-red-800 px-2 py-1 rounded flex items-center gap-1"><div className="w-2 h-2 bg-red-500 rounded-full"></div></div>
                        )}
                        
                        {/* Logout Button */}
                        <button onClick={(e) => { e.stopPropagation(); handleLogout(); }} className="text-[10px] bg-slate-800 text-slate-300 border border-slate-600 px-2 py-1 rounded flex items-center gap-1 hover:bg-red-900/50 hover:text-red-200 hover:border-red-700 transition-colors">
                            {getIcon("X", "w-3 h-3")} Sair
                        </button>
                      </div>
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
              {isBuffActive && <span className={`text-xs font-bold ${isDebuff ? 'text-red-400' : 'text-purple-400'} animate-pulse flex items-center gap-1`}>{getIcon(isDebuff ? "TriangleAlert" : "Clock", "w-3 h-3")} {buffPercentage}% XP</span>}
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
        
        {/* PVP Dashboard */}
        {duels.length > 0 && (
            <div className="bg-slate-900 border border-red-900/50 p-4 rounded-xl">
                 <h2 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    {getIcon("Swords", "w-4 h-4")} Duelos Ativos
                </h2>
                <div className="space-y-2">
                    {duels.map(duel => (
                        <div key={duel.id} className="bg-slate-800 p-3 rounded-lg flex items-center justify-between">
                             <div className="text-xs w-full">
                                 <div className="flex justify-between mb-1">
                                     <span className="text-blue-400 font-bold">{duel.challengerName} ({duel.challengerProgress})</span>
                                     <span className="text-slate-500 text-[10px]">vs</span>
                                     <span className="text-red-400 font-bold">{duel.opponentName} ({duel.opponentProgress})</span>
                                 </div>
                                 <div className="text-[10px] text-slate-400 mb-2">{ACTIVITIES.find(a => a.id === duel.activityId)?.label} - Meta: {duel.targetAmount}</div>
                                 
                                 {duel.status === 'pending' ? (
                                     duel.opponentId === currentUser?.uid ? (
                                         <button onClick={() => handleAcceptDuel(duel)} className="w-full bg-green-600 text-white py-1 rounded text-[10px]">ACEITAR DUELO</button>
                                     ) : (
                                         <div className="w-full text-center text-yellow-500 text-[10px]">Aguardando Oponente...</div>
                                     )
                                 ) : duel.status === 'finished' ? (
                                     <div className="w-full text-center font-bold text-yellow-400 text-[10px]">Vencedor: {duel.winnerId === duel.challengerId ? duel.challengerName : duel.opponentName}</div>
                                 ) : (
                                     <div className="w-full h-1 bg-slate-700 rounded-full flex">
                                          <div className="bg-blue-500 h-full" style={{ width: `${(duel.challengerProgress / duel.targetAmount) * 50}%`}}></div>
                                          <div className="bg-red-500 h-full ml-auto" style={{ width: `${(duel.opponentProgress / duel.targetAmount) * 50}%`}}></div>
                                     </div>
                                 )}
                             </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

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
                            onClick={() => { 
                                if (act.id === 'sleep') {
                                    setIsSleepModalOpen(true);
                                } else {
                                    setSelectedActivity(act); 
                                    setIsActivityModalOpen(true); 
                                    // Reset inputs
                                    setTargetTool(
                                        act.id === 'shooting' ? 'curta' : 
                                        act.id === 'archery' ? 'recurvo' : 
                                        act.id === 'knife_throw' ? 'sem_giro' :
                                        ''
                                    );
                                }
                            }}
                            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95 group"
                        >
                            <div className={`p-3 rounded-full bg-slate-900 group-hover:bg-slate-800 transition-colors ${category.color}`}>
                            {getIcon(act.icon)}
                            </div>
                            <span className="text-xs font-bold text-center">{act.label}</span>
                        </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
      </main>

      {/* --- MODAIS --- */}

      {/* MODAL RANKING GLOBAL */}
      <Modal isOpen={isRankModalOpen} onClose={() => { setIsRankModalOpen(false); setViewingProfile(null); }} title="Ranking Global" large>
           {viewingProfile ? (
               // PUBLIC PROFILE VIEW
               <div className="space-y-6">
                   <button onClick={() => setViewingProfile(null)} className="text-xs text-blue-400 flex items-center gap-1 mb-4">
                       {getIcon("ChevronLeft", "w-4 h-4")} Voltar ao Ranking
                   </button>
                   
                   <div className="flex flex-col items-center text-center">
                       <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-slate-700 mb-3">
                           <img 
                               src={viewingProfile.avatarImage || `https://api.dicebear.com/9.x/micah/svg?seed=${viewingProfile.name.replace(/\s/g, '')}`} 
                               alt={viewingProfile.name} 
                               className="w-full h-full object-cover" 
                           />
                       </div>
                       <h2 className="text-2xl font-bold text-white">{viewingProfile.name}</h2>
                       <span className="text-sm text-blue-400 font-bold uppercase tracking-wider">{viewingProfile.classTitle} • Lvl {viewingProfile.level}</span>
                   </div>

                   <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                       <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 text-center">Atributos</h3>
                       <RadarChart attributes={viewingProfile.attributes} />
                   </div>
                   
                   {currentUser && (
                       <button 
                         onClick={() => {
                             handleChallenge(viewingProfile);
                             setIsRankModalOpen(false);
                             setViewingProfile(null);
                         }}
                         className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2"
                       >
                           {getIcon("Swords")} Desafiar para Duelo
                       </button>
                   )}
               </div>
           ) : (
               // RANKING LIST
               <div>
                   <div className="flex gap-2 overflow-x-auto pb-4 mb-2">
                       {['Todos', ...RPG_CLASSES].map(c => (
                           <button 
                             key={c}
                             onClick={() => setRankFilter(c)}
                             className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${rankFilter === c ? 'bg-yellow-500 text-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                           >
                               {c}
                           </button>
                       ))}
                   </div>
                   
                   <div className="space-y-2">
                       {rankingList.length === 0 ? (
                           <p className="text-center text-slate-500 py-8">Carregando guerreiros...</p>
                       ) : (
                           rankingList.map((p, index) => (
                               <div key={p.uid} onClick={() => setViewingProfile(p)} className="bg-slate-800 p-3 rounded-lg flex items-center gap-3 cursor-pointer hover:bg-slate-700 transition-colors border border-transparent hover:border-slate-600">
                                   <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center font-black text-slate-500 bg-slate-900 rounded-full">
                                       {index + 1}
                                   </div>
                                   <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-900">
                                       <img src={p.avatarImage || `https://api.dicebear.com/9.x/micah/svg?seed=${p.name.replace(/\s/g, '')}`} className="w-full h-full object-cover" />
                                   </div>
                                   <div className="flex-1 min-w-0">
                                       <h4 className="font-bold text-white truncate">{p.name}</h4>
                                       <p className="text-xs text-blue-400">{p.classTitle} • Lvl {p.level}</p>
                                   </div>
                                   <div className="text-right">
                                       <span className="text-xs font-bold text-yellow-500">{Math.floor(p.totalXp / 1000)}k XP</span>
                                   </div>
                               </div>
                           ))
                       )}
                   </div>
               </div>
           )}
      </Modal>

      {/* ACTIVITY MODAL */}
      <Modal isOpen={isActivityModalOpen} onClose={() => { setIsActivityModalOpen(false); setInputAmount(''); }} title={selectedActivity?.label || 'Registrar Atividade'}>
          {/* ... (Existing Activity Modal Content - Keeping it same structure) */}
          <div className="space-y-6">
          <div className="flex justify-center mb-4">
            <div className={`p-4 rounded-full bg-slate-800 ${ACTIVITY_CATEGORIES.find(c => c.types.includes(selectedActivity?.category || ''))?.color || 'text-white'}`}>
              {selectedActivity && getIcon(selectedActivity.icon, "w-12 h-12")}
            </div>
          </div>
          
          {selectedActivity?.id === 'gym' ? (
              <div className="space-y-4">
                  <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Exercício</label>
                      <input 
                          list="gym-exercises" 
                          value={gymExercise} 
                          onChange={e => setGymExercise(e.target.value)} 
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" 
                          placeholder="Ex: Supino Reto" 
                      />
                      <datalist id="gym-exercises">
                          {uniqueExercises.map(ex => <option key={ex} value={ex} />)}
                      </datalist>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Carga (Kg)</label>
                          <input type="number" value={gymWeight} onChange={e => setGymWeight(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Repetições</label>
                          <input type="number" value={gymReps} onChange={e => setGymReps(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
                      </div>
                  </div>
                  
                  {/* Timer UI */}
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center">
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Descanso</label>
                      <div className="flex items-center justify-center gap-4 mb-3">
                          <button onClick={() => setGymRestTime("01:00")} className="text-xs bg-slate-700 px-2 py-1 rounded hover:bg-slate-600">1:00</button>
                          <button onClick={() => setGymRestTime("01:30")} className="text-xs bg-slate-700 px-2 py-1 rounded hover:bg-slate-600">1:30</button>
                          <button onClick={() => setGymRestTime("02:00")} className="text-xs bg-slate-700 px-2 py-1 rounded hover:bg-slate-600">2:00</button>
                      </div>
                      
                      {isResting ? (
                          <div className="text-4xl font-mono font-bold text-blue-400 animate-pulse">
                              {Math.floor(timerTimeLeft / 60)}:{(timerTimeLeft % 60).toString().padStart(2, '0')}
                          </div>
                      ) : (
                          <input type="time" value={gymRestTime} onChange={e => setGymRestTime(e.target.value)} className="bg-slate-950 text-white p-2 rounded text-center font-mono w-24 mx-auto block" />
                      )}
                      
                      {isResting && (
                          <button onClick={() => { setIsResting(false); setTimerTimeLeft(0); }} className="mt-3 text-xs text-red-400 flex items-center justify-center gap-1 mx-auto hover:text-red-300">
                              {getIcon("X", "w-3 h-3")} Cancelar Timer
                          </button>
                      )}
                  </div>

                  <button onClick={handleLogActivity} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                    {getIcon("CheckCircle", "w-5 h-5")} Registrar Série
                  </button>
              </div>
          ) : selectedActivity?.id === 'run' ? (
              <div className="space-y-4">
                  <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Distância (Km)</label>
                      <input type="number" step="0.01" value={runDistance} onChange={e => setRunDistance(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0.00" />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tempo Total (MM:SS)</label>
                      <div className="flex gap-2 items-center">
                          <input type="text" value={runDuration} onChange={e => {
                              // Simple mask logic for MM:SS
                              let val = e.target.value.replace(/\D/g, '');
                              if (val.length > 4) val = val.slice(0, 4);
                              if (val.length > 2) val = val.slice(0, 2) + ':' + val.slice(2);
                              setRunDuration(val);
                          }} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono text-center" placeholder="00:00" />
                      </div>
                  </div>
                  
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
                      <div className="text-center w-full">
                          <span className="block text-xs text-slate-400 uppercase font-bold">Ritmo (Pace)</span>
                          <span className={`text-2xl font-mono font-bold ${Number(currentPace.split(':')[0]) < 4 ? 'text-yellow-400' : Number(currentPace.split(':')[0]) < 5 ? 'text-blue-400' : 'text-white'}`}>
                              {currentPace} <span className="text-xs text-slate-500">/km</span>
                          </span>
                      </div>
                      <div className="text-center w-full border-l border-slate-600">
                           <span className="block text-xs text-slate-400 uppercase font-bold">XP Estimado</span>
                           <span className="text-2xl font-mono font-bold text-emerald-400">
                               {Math.floor((Number(runDistance)||0) * 30 * (Number(currentPace.split(':')[0]) < 4 ? 1.5 : Number(currentPace.split(':')[0]) < 5 ? 1.2 : 1))}
                           </span>
                      </div>
                  </div>

                  <button onClick={handleLogActivity} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                    {getIcon("CheckCircle", "w-5 h-5")} Registrar Corrida
                  </button>
              </div>
          ) : selectedActivity?.id === 'shooting' || selectedActivity?.id === 'archery' || selectedActivity?.id === 'knife_throw' ? (
              <div className="space-y-4">
                  {/* Target Practice UI */}
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                              {selectedActivity.id === 'shooting' ? 'Armamento' : selectedActivity.id === 'archery' ? 'Tipo de Arco' : 'Estilo'}
                          </label>
                          <select value={targetTool} onChange={e => setTargetTool(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none">
                              {selectedActivity.id === 'shooting' ? (
                                  <>
                                    <option value="curta">Arma Curta (Pistola)</option>
                                    <option value="longa">Arma Longa (Rifle)</option>
                                    <option value="espingarda">Espingarda</option>
                                  </>
                              ) : selectedActivity.id === 'archery' ? (
                                  <>
                                    <option value="recurvo">Recurvo</option>
                                    <option value="composto">Composto</option>
                                    <option value="longbow">Longbow</option>
                                    <option value="besta">Besta</option>
                                  </>
                              ) : (
                                  <>
                                    <option value="sem_giro">Sem Giro</option>
                                    <option value="meio_giro">Meio Giro</option>
                                    <option value="giro_completo">Giro Completo</option>
                                  </>
                              )}
                          </select>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Distância (m)</label>
                          <input type="number" value={targetDistance} onChange={e => setTargetDistance(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: 10" />
                      </div>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                      <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 text-center">Registro de Impactos</h4>
                      <div className="space-y-3">
                          {[
                              { key: 'center', label: 'Mosca (Centro)', color: 'text-red-500', pts: 10 },
                              { key: 'c1', label: 'Círculo 9-8', color: 'text-yellow-500', pts: 5 },
                              { key: 'c2', label: 'Círculo 7-6', color: 'text-blue-500', pts: 3 },
                              { key: 'c3', label: 'Círculo 5-4', color: 'text-white', pts: 2 },
                              { key: 'outer', label: 'Borda/Silhueta', color: 'text-slate-500', pts: 1 },
                          ].map(zone => (
                              <div key={zone.key} className="flex items-center justify-between">
                                  <span className={`text-sm font-bold ${zone.color}`}>{zone.label}</span>
                                  <div className="flex items-center gap-3">
                                      <button onClick={() => setTargetHits(prev => ({ ...prev, [zone.key]: Math.max(0, prev[zone.key as keyof typeof targetHits] - 1) }))} className="w-8 h-8 rounded bg-slate-800 text-white hover:bg-slate-700">-</button>
                                      <span className="w-6 text-center font-mono">{targetHits[zone.key as keyof typeof targetHits]}</span>
                                      <button onClick={() => setTargetHits(prev => ({ ...prev, [zone.key]: prev[zone.key as keyof typeof targetHits] + 1 }))} className="w-8 h-8 rounded bg-slate-800 text-white hover:bg-slate-700">+</button>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>

                  <button onClick={handleLogActivity} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                    {getIcon("CheckCircle", "w-5 h-5")} Registrar Sessão
                  </button>
              </div>
          ) : (
              <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                      Quantidade ({selectedActivity?.unit})
                    </label>
                    <input
                      type="number"
                      value={inputAmount}
                      onChange={(e) => setInputAmount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-4 text-white text-2xl font-bold text-center focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="0"
                      autoFocus
                    />
                  </div>
                  
                  <button onClick={handleLogActivity} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                    {getIcon("CheckCircle", "w-5 h-5")} Confirmar
                  </button>
              </div>
          )}
          </div>
      </Modal>

      {/* SLEEP MODAL */}
      <Modal isOpen={isSleepModalOpen} onClose={() => setIsSleepModalOpen(false)} title="Registrar Sono">
          <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Dormiu às</label>
                      <input type="time" value={bedTime} onChange={e => setBedTime(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white text-center focus:ring-2 focus:ring-purple-500 outline-none" />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Acordou às</label>
                      <input type="time" value={wakeTime} onChange={e => setWakeTime(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white text-center focus:ring-2 focus:ring-purple-500 outline-none" />
                  </div>
              </div>
              
              <div className="bg-purple-900/20 p-4 rounded-xl border border-purple-500/30">
                  <p className="text-xs text-purple-200 text-center leading-relaxed">
                      Dormir bem recupera sua energia e concede um <strong>Buff de XP</strong> para o dia seguinte.
                      <br/>O ideal é entre 7h e 9h de sono.
                  </p>
              </div>

              <button onClick={handleRegisterSleep} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {getIcon("Moon", "w-5 h-5")} Registrar Descanso
              </button>
          </div>
      </Modal>

      {/* PROFILE MODAL */}
      <Modal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} title="Ficha do Personagem" large>
          {isEditingProfile && user ? (
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div className="flex justify-center mb-6 relative">
                      <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-slate-600 bg-slate-800 relative group">
                          <img src={getAvatarUrl} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                              {getIcon("Camera", "w-8 h-8 text-white")}
                          </div>
                      </div>
                      <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Peso (kg)</label>
                          <input name="weight" type="number" step="0.1" defaultValue={user.weight} className="w-full bg-slate-950 border border-slate-700 rounded p-2" />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Altura (cm)</label>
                          <input name="height" type="number" defaultValue={user.height} className="w-full bg-slate-950 border border-slate-700 rounded p-2" />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Gênero</label>
                          <select name="gender" defaultValue={user.gender} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white">
                              <option value="Masculino">Masculino</option>
                              <option value="Feminino">Feminino</option>
                              <option value="Outros">Outros</option>
                          </select>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Profissão</label>
                          <input name="profession" defaultValue={user.profession} className="w-full bg-slate-950 border border-slate-700 rounded p-2" />
                      </div>
                  </div>
                  <div className="flex gap-2 pt-4">
                      <button type="button" onClick={() => setIsEditingProfile(false)} className="flex-1 bg-slate-700 p-3 rounded-lg font-bold">Cancelar</button>
                      <button type="submit" className="flex-1 bg-green-600 p-3 rounded-lg font-bold">Salvar Alterações</button>
                  </div>
              </form>
          ) : user && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
                  <div className="relative">
                      <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-slate-700 bg-slate-800 shadow-xl">
                          <img src={getAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                      </div>
                      <button onClick={() => setIsEditingProfile(true)} className="absolute bottom-0 right-0 bg-slate-700 p-2 rounded-full border border-slate-600 hover:bg-slate-600 text-white shadow-lg">
                          {getIcon("Pencil", "w-4 h-4")}
                      </button>
                  </div>
                  <div className="flex-1 text-center md:text-left space-y-1">
                      <h2 className="text-3xl font-black text-white">{user.name}</h2>
                      <p className="text-blue-400 font-bold uppercase tracking-widest text-sm">{gameState.classTitle} • Nível {gameState.level}</p>
                      <div className="flex flex-wrap gap-2 justify-center md:justify-start mt-2">
                          <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400 border border-slate-700">{user.profession}</span>
                          <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400 border border-slate-700">{user.weight}kg</span>
                          <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400 border border-slate-700">{user.height}cm</span>
                      </div>
                  </div>
              </div>

              <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner">
                  <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 text-center">Gráfico de Atributos</h3>
                  <RadarChart attributes={gameState.attributes} />
              </div>

              {/* DAILY SUMMARY */}
              <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
                       <button onClick={() => changeSummaryDate(-1)} className="p-2 hover:bg-slate-800 rounded-full">{getIcon("ChevronLeft")}</button>
                       <div className="text-center">
                           <h3 className="text-sm font-bold text-white flex items-center gap-2 justify-center">
                               {getIcon("Calendar", "w-4 h-4 text-blue-400")} 
                               {summaryDate.toLocaleDateString()}
                           </h3>
                           <span className="text-[10px] text-slate-500 uppercase font-bold">
                               {summaryDate.toDateString() === new Date().toDateString() ? "Hoje" : "Histórico"}
                           </span>
                       </div>
                       <button onClick={() => changeSummaryDate(1)} className={`p-2 hover:bg-slate-800 rounded-full ${summaryDate.toDateString() === new Date().toDateString() ? 'opacity-0 pointer-events-none' : ''}`}>{getIcon("ChevronRight")}</button>
                  </div>

                  {dailySummary.count === 0 ? (
                      <div className="text-center py-6 text-slate-500 text-sm">Nenhuma atividade registrada neste dia.</div>
                  ) : (
                      <div className="space-y-3">
                          <div className="flex justify-between items-center bg-blue-900/20 p-3 rounded-lg border border-blue-900/50">
                              <span className="text-xs font-bold text-blue-300 uppercase">XP Total do Dia</span>
                              <span className="text-lg font-black text-blue-400">+{dailySummary.totalXp} XP</span>
                          </div>
                          <div className="space-y-2">
                              {dailySummary.list.map((item, idx) => (
                                  <div key={idx} className="flex items-start gap-3 bg-slate-900 p-2 rounded border border-slate-800">
                                      <div className="pt-1">{getIcon(item.activity.icon, "w-4 h-4 text-slate-400")}</div>
                                      <div className="flex-1">
                                          <div className="flex justify-between">
                                              <span className="text-sm font-bold text-white">{item.activity.label}</span>
                                              <span className="text-xs font-bold text-slate-500">x{item.count}</span>
                                          </div>
                                          {item.details.length > 0 && (
                                              <p className="text-[10px] text-slate-400 mt-1">{item.details.slice(0, 3).join(', ')}{item.details.length > 3 ? '...' : ''}</p>
                                          )}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Histórico Completo</h3>
                <div className="max-h-60 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                    {historyGroups.map(([actId, logs]) => {
                        const act = ACTIVITIES.find(a => a.id === actId);
                        const isExpanded = expandedHistoryId === actId;
                        if (!act) return null;

                        return (
                            <div key={actId} className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
                                <button 
                                    onClick={() => setExpandedHistoryId(isExpanded ? null : actId)}
                                    className="w-full flex items-center justify-between p-3 hover:bg-slate-800 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="text-slate-400">{getIcon(act.icon, "w-4 h-4")}</div>
                                        <div className="text-left">
                                            <div className="text-sm font-bold text-white">{act.label}</div>
                                            <div className="text-[10px] text-slate-500">Último: {new Date(logs[0].timestamp).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-blue-500 bg-blue-900/20 px-2 py-1 rounded">{logs.length} regs</span>
                                        {getIcon(isExpanded ? "ChevronLeft" : "ChevronRight", `w-4 h-4 text-slate-500 transition-transform ${isExpanded ? '-rotate-90' : 'rotate-90'}`)}
                                    </div>
                                </button>
                                
                                {isExpanded && (
                                    <div className="bg-slate-950/50 p-2 space-y-2 border-t border-slate-800">
                                        {logs.map((log, index) => {
                                            const showDateHeader = index === 0 || getDayLabel(log.timestamp) !== getDayLabel(logs[index - 1].timestamp);
                                            return (
                                            <React.Fragment key={log.id}>
                                                {showDateHeader && (
                                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest py-1 border-b border-slate-800/50 mt-2 mb-1">
                                                        {getDayLabel(log.timestamp)}
                                                    </div>
                                                )}
                                                <div className="flex items-center justify-between text-xs p-2 rounded hover:bg-slate-800/50">
                                                    <div>
                                                        <span className="text-slate-300 font-semibold mr-2">
                                                            {log.details?.exercise ? log.details.exercise : 
                                                             log.details?.distance ? `${log.details.distance}km` :
                                                             `${log.amount} ${act.unit}`}
                                                        </span>
                                                        {log.details && (
                                                            <span className="text-[10px] text-slate-500 block">
                                                                {log.details.weight ? `${log.details.weight}kg x ${log.details.reps}` : 
                                                                 log.details.pace ? `Pace: ${log.details.pace}` : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-green-500 font-bold">+{log.xpGained} XP</span>
                                                        <button onClick={() => handleDeleteLog(log.id)} className="text-slate-600 hover:text-red-500 transition-colors p-1">
                                                            {getIcon("Trash2", "w-3 h-3")}
                                                        </button>
                                                    </div>
                                                </div>
                                            </React.Fragment>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
              </div>
            </div>
          )}
      </Modal>

      {/* QUESTS MODAL */}
      <Modal isOpen={isQuestModalOpen} onClose={() => setIsQuestModalOpen(false)} title="Missões">
          <div className="space-y-6">
              {/* Daily Quests Section */}
              <div>
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      {getIcon("Clock", "w-4 h-4")} Diárias
                  </h3>
                  
                  {/* BASIC HABITS (TOP) */}
                  <div className="mb-4 space-y-3">
                      <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest border-b border-blue-900/30 pb-1 mb-2">Hábitos Essenciais</h4>
                      {basicDailyQuests.map(quest => {
                          const act = ACTIVITIES.find(a => a.id === quest.activityId);
                          if (!act) return null;
                          const progress = Math.min(100, (quest.currentAmount / quest.targetAmount) * 100);
                          
                          return (
                              <div key={quest.id} className="bg-slate-800 p-3 rounded-lg border border-slate-700/50 relative overflow-hidden">
                                  <div className="flex justify-between items-center mb-2 relative z-10">
                                      <div className="flex items-center gap-2">
                                          <div className="text-slate-400">{getIcon(act.icon, "w-4 h-4")}</div>
                                          <div>
                                              <div className="text-xs font-bold text-white">{act.label}</div>
                                              <div className="text-[10px] text-slate-500">{quest.currentAmount} / {quest.targetAmount} {act.unit}</div>
                                          </div>
                                      </div>
                                      {quest.isClaimed ? (
                                          <span className="text-xs font-bold text-green-500 flex items-center gap-1">{getIcon("CheckCircle", "w-3 h-3")} Feito</span>
                                      ) : quest.currentAmount >= quest.targetAmount ? (
                                          <button onClick={() => handleClaimQuest(quest.id)} className="text-xs bg-yellow-500 text-black font-bold px-3 py-1 rounded animate-pulse">
                                              Coletar {quest.xpReward} XP
                                          </button>
                                      ) : (
                                          <span className="text-xs font-bold text-slate-600">{quest.xpReward} XP</span>
                                      )}
                                  </div>
                                  <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                                      <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                  </div>
                              </div>
                          );
                      })}
                  </div>

                  {/* TRAINING & CLASS (BOTTOM) */}
                  <div className="space-y-3">
                      <h4 className="text-[10px] font-bold text-red-400 uppercase tracking-widest border-b border-red-900/30 pb-1 mb-2">Treino & Classe</h4>
                      {advancedDailyQuests.map(quest => {
                          const act = ACTIVITIES.find(a => a.id === quest.activityId);
                          if (!act) return null;
                          const progress = Math.min(100, (quest.currentAmount / quest.targetAmount) * 100);
                          
                          return (
                              <div key={quest.id} className="bg-slate-800 p-3 rounded-lg border border-slate-700/50 relative overflow-hidden">
                                  <div className="flex justify-between items-center mb-2 relative z-10">
                                      <div className="flex items-center gap-2">
                                          <div className="text-slate-400">{getIcon(act.icon, "w-4 h-4")}</div>
                                          <div>
                                              <div className="text-xs font-bold text-white">{act.label}</div>
                                              <div className="text-[10px] text-slate-500">{quest.currentAmount} / {quest.targetAmount} {act.unit}</div>
                                          </div>
                                      </div>
                                      {quest.isClaimed ? (
                                          <span className="text-xs font-bold text-green-500 flex items-center gap-1">{getIcon("CheckCircle", "w-3 h-3")} Feito</span>
                                      ) : quest.currentAmount >= quest.targetAmount ? (
                                          <button onClick={() => handleClaimQuest(quest.id)} className="text-xs bg-yellow-500 text-black font-bold px-3 py-1 rounded animate-pulse">
                                              Coletar {quest.xpReward} XP
                                          </button>
                                      ) : (
                                          <span className="text-xs font-bold text-slate-600">{quest.xpReward} XP</span>
                                      )}
                                  </div>
                                  <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                                      <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
              
              {/* Weekly Quests Section */}
              <div>
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2 mt-6">
                      {getIcon("Calendar", "w-4 h-4")} Semanais
                  </h3>
                  <div className="space-y-3">
                      {weeklyQuests.map(quest => {
                          const act = ACTIVITIES.find(a => a.id === quest.activityId);
                          if (!act) return null;
                          const progress = Math.min(100, (quest.currentAmount / quest.targetAmount) * 100);
                          return (
                              <div key={quest.id} className="bg-slate-800 p-3 rounded-lg border border-yellow-900/30 relative overflow-hidden">
                                  <div className="flex justify-between items-center mb-2 relative z-10">
                                      <div className="flex items-center gap-2">
                                          <div className="text-yellow-600">{getIcon("Star", "w-4 h-4")}</div>
                                          <div>
                                              <div className="text-xs font-bold text-white">{act.label}</div>
                                              <div className="text-[10px] text-slate-500">{quest.currentAmount} / {quest.targetAmount} {act.unit}</div>
                                          </div>
                                      </div>
                                      {quest.isClaimed ? (
                                          <span className="text-xs font-bold text-green-500 flex items-center gap-1">{getIcon("CheckCircle", "w-3 h-3")} Feito</span>
                                      ) : quest.currentAmount >= quest.targetAmount ? (
                                          <button onClick={() => handleClaimQuest(quest.id)} className="text-xs bg-yellow-500 text-black font-bold px-3 py-1 rounded animate-pulse">
                                              Coletar {quest.xpReward} XP
                                          </button>
                                      ) : (
                                          <span className="text-xs font-bold text-slate-600">{quest.xpReward} XP</span>
                                      )}
                                  </div>
                                  <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                                      <div className="bg-yellow-600 h-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
          </div>
      </Modal>

      {/* GUILD MODAL */}
      <Modal isOpen={isGuildModalOpen} onClose={() => setIsGuildModalOpen(false)} title="Clã" large>
          {!currentUser ? (
              <div className="text-center py-8">
                  <p className="text-slate-400 mb-4">Você precisa estar logado para acessar os Clãs.</p>
                  <button onClick={() => { setIsGuildModalOpen(false); setAuthView('login'); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg">Fazer Login</button>
              </div>
          ) : !currentGuild ? (
              <div className="space-y-6">
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                      <h4 className="font-bold text-white mb-2">Entrar em um Clã</h4>
                      <div className="flex gap-2">
                          <input 
                            value={guildInputId} 
                            onChange={e => setGuildInputId(e.target.value)} 
                            className="flex-1 bg-slate-950 border border-slate-700 rounded p-2 text-sm" 
                            placeholder="ID do Clã" 
                          />
                          <button onClick={handleJoinGuild} className="bg-blue-600 px-4 rounded text-sm font-bold">Entrar</button>
                      </div>
                  </div>
                  
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                      <h4 className="font-bold text-white mb-2">Criar Novo Clã</h4>
                      <div className="flex gap-2">
                          <input 
                            value={guildCreateName} 
                            onChange={e => setGuildCreateName(e.target.value)} 
                            className="flex-1 bg-slate-950 border border-slate-700 rounded p-2 text-sm" 
                            placeholder="Nome do Clã" 
                          />
                          <button onClick={handleCreateGuild} className="bg-green-600 px-4 rounded text-sm font-bold">Criar</button>
                      </div>
                  </div>
              </div>
          ) : (
              <div className="h-[500px] flex flex-col">
                  {/* Guild Tabs */}
                  <div className="flex border-b border-slate-700 mb-4">
                      <button onClick={() => setGuildTab('info')} className={`flex-1 pb-2 text-sm font-bold uppercase ${guildTab === 'info' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}>Geral</button>
                      <button onClick={() => setGuildTab('chat')} className={`flex-1 pb-2 text-sm font-bold uppercase ${guildTab === 'chat' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}>Chat</button>
                      <button onClick={() => setGuildTab('raid')} className={`flex-1 pb-2 text-sm font-bold uppercase ${guildTab === 'raid' ? 'text-red-400 border-b-2 border-red-400' : 'text-slate-500'}`}>Raid (Boss)</button>
                  </div>

                  {/* Tab Content */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                      {guildTab === 'info' && (
                          <div className="space-y-4">
                              <div className="text-center mb-6">
                                  <h2 className="text-2xl font-black text-white">{currentGuild.name}</h2>
                                  <p className="text-slate-400 text-xs">ID: {currentGuild.id}</p>
                                  <div className="inline-block bg-yellow-500/10 text-yellow-500 px-3 py-1 rounded-full text-xs font-bold mt-2 border border-yellow-500/30">
                                      Nível {currentGuild.level}
                                  </div>
                              </div>
                              
                              <div>
                                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Membros ({Object.keys(currentGuild.members).length})</h4>
                                  <div className="space-y-2">
                                      {Object.values(currentGuild.members).map((m: GuildMember) => (
                                          <div key={m.uid} className="flex items-center justify-between bg-slate-800 p-2 rounded">
                                              <div className="flex items-center gap-2">
                                                  <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden">
                                                      <img src={m.avatar || `https://api.dicebear.com/9.x/micah/svg?seed=${m.name}`} className="w-full h-full object-cover" />
                                                  </div>
                                                  <div>
                                                      <div className="text-sm font-bold text-white">{m.name}</div>
                                                      <div className="text-[10px] text-slate-400">{m.classTitle} • Lvl {m.level}</div>
                                                  </div>
                                              </div>
                                              {m.role === 'leader' && <span className="text-xs text-yellow-500">{getIcon("Crown", "w-4 h-4")}</span>}
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          </div>
                      )}

                      {guildTab === 'chat' && (
                          <div className="flex flex-col h-full">
                              <div className="flex-1 space-y-3 p-2 overflow-y-auto">
                                  {chatMessages.map(msg => (
                                      <div key={msg.id} className={`flex flex-col ${msg.type === 'system' ? 'items-center' : msg.senderId === currentUser.uid ? 'items-end' : 'items-start'}`}>
                                          {msg.type === 'system' ? (
                                              <span className="bg-slate-800 text-slate-400 text-[10px] px-2 py-1 rounded-full">{msg.text}</span>
                                          ) : (
                                              <div className={`max-w-[80%] p-2 rounded-lg ${msg.senderId === currentUser.uid ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
                                                  <div className="text-[10px] font-bold opacity-70 mb-1">{msg.senderName}</div>
                                                  <div className="text-sm">{msg.text}</div>
                                              </div>
                                          )}
                                      </div>
                                  ))}
                                  <div ref={chatEndRef} />
                              </div>
                              <div className="mt-2 flex gap-2 pt-2 border-t border-slate-700">
                                  <input 
                                    value={chatInput} 
                                    onChange={e => setChatInput(e.target.value)} 
                                    onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                    className="flex-1 bg-slate-950 border border-slate-700 rounded p-2 text-sm" 
                                    placeholder="Mensagem..." 
                                  />
                                  <button onClick={handleSendMessage} className="bg-blue-600 px-3 rounded">{getIcon("MessageSquare", "w-4 h-4")}</button>
                              </div>
                          </div>
                      )}

                      {guildTab === 'raid' && currentGuild.boss && (
                          <div className="text-center space-y-6 pt-4">
                              <div className="text-6xl animate-bounce-slow">{currentGuild.boss.image}</div>
                              <div>
                                  <h3 className="text-xl font-black text-red-500">{currentGuild.boss.name}</h3>
                                  <p className="text-xs text-slate-400 font-bold uppercase">Nível {currentGuild.boss.level}</p>
                              </div>
                              
                              <div className="relative pt-1 px-4">
                                  <div className="flex mb-1 items-center justify-between">
                                      <span className="text-xs font-bold text-red-200">{currentGuild.boss.currentHp} / {currentGuild.boss.maxHp} HP</span>
                                  </div>
                                  <div className="overflow-hidden h-4 text-xs flex rounded bg-red-900">
                                      <div style={{ width: `${(currentGuild.boss.currentHp / currentGuild.boss.maxHp) * 100}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-red-500 transition-all duration-500"></div>
                                  </div>
                              </div>

                              <div className="grid grid-cols-3 gap-2 px-4">
                                  <button onClick={handleAttackBoss} className="bg-red-900/40 border border-red-600 hover:bg-red-800 p-2 rounded-lg flex flex-col items-center gap-1 group">
                                      {getIcon("Swords", "w-6 h-6 text-red-400 group-hover:scale-110 transition-transform")}
                                      <span className="text-[10px] font-bold">Atacar (Flexão)</span>
                                  </button>
                                  <button onClick={handleAttackBoss} className="bg-red-900/40 border border-red-600 hover:bg-red-800 p-2 rounded-lg flex flex-col items-center gap-1 group">
                                      {getIcon("ArrowBigUp", "w-6 h-6 text-red-400 group-hover:scale-110 transition-transform")}
                                      <span className="text-[10px] font-bold">Atacar (Abdominal)</span>
                                  </button>
                                  <button onClick={handleAttackBoss} className="bg-red-900/40 border border-red-600 hover:bg-red-800 p-2 rounded-lg flex flex-col items-center gap-1 group">
                                      {getIcon("ArrowBigUp", "w-6 h-6 text-red-400 group-hover:scale-110 transition-transform")}
                                      <span className="text-[10px] font-bold">Atacar (Agachamento)</span>
                                  </button>
                              </div>
                              <p className="text-[10px] text-slate-500 px-6">
                                  Realize exercícios reais e clique para causar dano! O dano é baseado no seu Nível.
                              </p>
                          </div>
                      )}
                  </div>
              </div>
          )}
      </Modal>

    </div>
  );
}
