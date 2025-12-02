import React, { useState, useEffect, useMemo, useRef } from 'react';
import { UserProfile, GameState, ActivityLog, ACTIVITIES, ActivityType, Gender, Attribute, ATTRIBUTE_LABELS, Quest, BASIC_ACTIVITY_IDS, Guild, ChatMessage, GuildMember, RPG_CLASSES, PublicProfile, Duel, Territory } from './types';
import { getIcon } from './components/Icons';
import { generateRpgFlavorText, NarratorTrigger } from './services/geminiService';
import { auth, loginWithGoogle, logoutUser, saveUserDataToCloud, loadUserDataFromCloud, checkRedirectResult, createGuild, joinGuild, sendMessage, subscribeToGuild, attackBoss, registerWithEmail, loginWithEmail, getGlobalRanking, createDuel, fetchActiveDuels, acceptDuel, updateDuelProgress, cancelDuel, createTerritory, deleteTerritory, subscribeToTerritories, attackTerritoryTarget, banUser } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';

// --- Helper Functions ---
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);  // deg2rad below
  var dLon = deg2rad(lon2-lon1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI/180)
}

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
const RadarChart = ({ attributes }: { attributes: Record<Attribute, number> }) => {
  const size = 300;
  const center = size / 2;
  const radius = (size / 2) - 40;
  
  const attributeKeys: Attribute[] = ['STR', 'AGI', 'DEX', 'DRV', 'INT', 'CHA', 'VIG', 'END'];
  const values = attributeKeys.map(k => attributes[k] || 0);
  const maxVal = Math.max(20, ...values); 

  const getCoordinates = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / attributeKeys.length - Math.PI / 2;
    const r = (value / maxVal) * radius;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y };
  };

  const points = attributeKeys.map((key, i) => {
    const val = attributes[key] || 0;
    const { x, y } = getCoordinates(i, val);
    return `${x},${y}`;
  }).join(" ");

  const backgroundPoints = attributeKeys.map((_, i) => {
    const { x, y } = getCoordinates(i, maxVal);
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="relative flex justify-center py-4">
      <svg width={size} height={size} className="overflow-visible">
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
        <polygon points={points} fill="rgba(16, 185, 129, 0.4)" stroke="#10b981" strokeWidth="2" />
        {attributeKeys.map((key, i) => {
            const val = attributes[key] || 0;
            const { x, y } = getCoordinates(i, val);
            return <circle key={i} cx={x} cy={y} r="3" fill="#34d399" />;
        })}
        {attributeKeys.map((key, i) => {
          const { x, y } = getCoordinates(i, maxVal + (maxVal * 0.18)); 
          const val = attributes[key] || 0;
          return (
            <g key={i}>
                <text x={x} y={y - 5} textAnchor="middle" dominantBaseline="middle" className="text-[10px] fill-slate-300 font-bold uppercase" style={{ fontSize: '10px' }}>{ATTRIBUTE_LABELS[key]}</text>
                <text x={x} y={y + 8} textAnchor="middle" dominantBaseline="middle" className="text-[9px] fill-emerald-400 font-bold">{Math.floor(val)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// --- Configs ---
const ACTIVITY_CATEGORIES = [
  { id: 'common', label: 'Atividades Comuns', types: ['health'], color: 'text-yellow-400', icon: 'Star' },
  { id: 'physical', label: 'Treino Físico', types: ['fitness'], color: 'text-blue-400', icon: 'Dumbbell' },
  { id: 'combat', label: 'Treino Combate', types: ['combat'], color: 'text-red-400', icon: 'Swords' },
  { id: 'intellect', label: 'Atividades Intelectuais', types: ['intellect'], color: 'text-purple-400', icon: 'Brain' },
  { id: 'social', label: 'Bom-feitor', types: ['social'], color: 'text-emerald-400', icon: 'Heart' },
  { id: 'bad_habit', label: 'Hábitos Nocivos', types: ['bad_habit'], color: 'text-slate-400', icon: 'TriangleAlert' }
];

const ATROPHY_THRESHOLDS: Record<Attribute, number> = {
    STR: 14, VIG: 14, INT: 14, AGI: 18, END: 21, DEX: 25, CHA: 21, DRV: 30
};

// --- Leaflet Map Helper ---
const RecenterMap = ({ lat, lng }: { lat: number, lng: number }) => {
    const map = useMap();
    useEffect(() => {
        map.setView([lat, lng]);
    }, [lat, lng]);
    return null;
}

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    level: 1, currentXp: 0, totalXp: 0, logs: [], classTitle: "NPC",
    attributes: { STR: 0, END: 0, VIG: 0, AGI: 0, DEX: 0, INT: 0, CHA: 0, DRV: 0 }, 
    activeBuff: null, quests: []
  });
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isSleepModalOpen, setIsSleepModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isQuestModalOpen, setIsQuestModalOpen] = useState(false);
  const [isGuildModalOpen, setIsGuildModalOpen] = useState(false);
  const [isRankModalOpen, setIsRankModalOpen] = useState(false);
  const [isChallengeModalOpen, setIsChallengeModalOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  
  // Profile Summary State
  const [summaryDate, setSummaryDate] = useState(new Date());

  const [selectedActivity, setSelectedActivity] = useState<ActivityType | null>(null);
  const [inputAmount, setInputAmount] = useState('');

  // Gym/Activity Inputs
  const [gymExercise, setGymExercise] = useState('');
  const [gymWeight, setGymWeight] = useState('');
  const [gymReps, setGymReps] = useState('');
  const [gymRestTime, setGymRestTime] = useState('02:00');
  
  // NEW TIMER LOGIC: Using Timestamp instead of countdown for persistence
  const [restEndTime, setRestEndTime] = useState<number | null>(null);
  const [timerTimeLeft, setTimerTimeLeft] = useState(0);

  const [runDistance, setRunDistance] = useState('');
  const [runDuration, setRunDuration] = useState('');
  const [targetTool, setTargetTool] = useState('');
  const [targetDistance, setTargetDistance] = useState('');
  const [targetHits, setTargetHits] = useState({ center: 0, c1: 0, c2: 0, c3: 0, outer: 0 });
  const [bedTime, setBedTime] = useState('22:00');
  const [wakeTime, setWakeTime] = useState('06:00');

  const [narratorText, setNarratorText] = useState<string>("Bem-vindo ao LifeRPG. Comece sua jornada!");
  const [loadingAi, setLoadingAi] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');

  const [currentGuild, setCurrentGuild] = useState<Guild | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [guildInputId, setGuildInputId] = useState('');
  const [guildCreateName, setGuildCreateName] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [guildTab, setGuildTab] = useState<'info' | 'chat' | 'raid'>('info');

  const [rankingList, setRankingList] = useState<PublicProfile[]>([]);
  const [rankFilter, setRankFilter] = useState('Todos');
  const [viewingProfile, setViewingProfile] = useState<PublicProfile | null>(null);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [challengeOpponent, setChallengeOpponent] = useState<PublicProfile | null>(null);
  const [challengeActivityId, setChallengeActivityId] = useState('pushup');
  const [challengeTarget, setChallengeTarget] = useState('');
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // Map & Territory State
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null);
  const [userList, setUserList] = useState<PublicProfile[]>([]); // For Admin

  // Admin Create Territory Inputs
  const [newTerritoryName, setNewTerritoryName] = useState('');
  const [newTerritoryRadius, setNewTerritoryRadius] = useState(100);
  const [newEnemyName, setNewEnemyName] = useState('Inimigo Local');
  const [newEnemyHp, setNewEnemyHp] = useState(500);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const hasNarratorRunRef = useRef(false);

  const XP_FOR_NEXT_LEVEL_BASE = 100;

  // --- Computed Memos ---
  const uniqueExercises = useMemo(() => {
    const exercises = new Set<string>();
    gameState.logs.forEach(log => { if (log.activityId === 'gym' && log.details?.exercise) exercises.add(log.details.exercise); });
    return Array.from(exercises).sort();
  }, [gameState.logs]);

  const historyGroups = useMemo(() => {
    const groups: Record<string, ActivityLog[]> = {};
    gameState.logs.forEach(log => { if (!groups[log.activityId]) groups[log.activityId] = []; groups[log.activityId].push(log); });
    return Object.entries(groups).sort(([, aLogs], [, bLogs]) => bLogs[0].timestamp - aLogs[0].timestamp);
  }, [gameState.logs]);

  const dailySummary = useMemo(() => {
    const targetDate = summaryDate.toDateString();
    const logsForDay = gameState.logs.filter(log => new Date(log.timestamp).toDateString() === targetDate);
    const totalXp = logsForDay.reduce((acc, log) => acc + log.xpGained, 0);
    const summaryList: { activity: ActivityType, count: number, totalAmount: number, details: string[] }[] = [];
    logsForDay.forEach(log => {
        const act = ACTIVITIES.find(a => a.id === log.activityId);
        if (!act) return;
        const existing = summaryList.find(s => s.activity.id === act.id);
        let detailStr = "";
        if (log.details?.exercise) detailStr = `${log.details.exercise} (${log.details.weight}kg)`;
        else if (log.details?.distance) detailStr = `${log.details.distance}km`;
        else if (log.details?.weapon) detailStr = log.details.weapon;
        if (existing) { existing.count += 1; existing.totalAmount += log.amount; if (detailStr) existing.details.push(detailStr); } 
        else { summaryList.push({ activity: act, count: 1, totalAmount: log.amount, details: detailStr ? [detailStr] : [] }); }
    });
    return { totalXp, list: summaryList, count: logsForDay.length };
  }, [gameState.logs, summaryDate]);

  const changeSummaryDate = (days: number) => { const newDate = new Date(summaryDate); newDate.setDate(newDate.getDate() + days); setSummaryDate(newDate); };

  // --- Connectivity ---
  useEffect(() => {
    const handleOnline = () => {
        setIsOnline(true);
        const needsSync = localStorage.getItem('liferpg_needs_sync') === 'true';
        if (needsSync && currentUser && user && gameState) {
             setNarratorText("Sincronizando dados..."); setIsSyncing(true);
             saveUserDataToCloud(currentUser.uid, user, gameState).then((success) => { if (success) { localStorage.removeItem('liferpg_needs_sync'); setNarratorText("Sincronizado!"); } setIsSyncing(false); });
        }
    };
    const handleOffline = () => { setIsOnline(false); setNarratorText("Modo Offline."); };
    window.addEventListener('online', handleOnline); window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, [currentUser, user, gameState]);

  // --- Robust Timer Logic ---
  useEffect(() => {
    if (restEndTime) {
        // Update timer immediately and then every second
        const updateTimer = () => {
            const now = Date.now();
            const diff = Math.ceil((restEndTime - now) / 1000);
            if (diff <= 0) {
                setRestEndTime(null);
                setTimerTimeLeft(0);
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            } else {
                setTimerTimeLeft(diff);
            }
        };

        updateTimer(); // Run once immediately
        timerIntervalRef.current = window.setInterval(updateTimer, 500); // Check frequently
    } else {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        setTimerTimeLeft(0);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [restEndTime]);

  // --- Geolocation ---
  useEffect(() => {
      if ('geolocation' in navigator) {
          const watchId = navigator.geolocation.watchPosition(
              (pos) => { setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
              (err) => console.error("Error getting location", err),
              { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 }
          );
          return () => navigator.geolocation.clearWatch(watchId);
      }
  }, []);

  // --- Subscriptions ---
  useEffect(() => {
    // Subscribe to territories
    const unsubTerritories = subscribeToTerritories((list) => {
        setTerritories(list);
    });
    return () => unsubTerritories();
  }, []);
  
  // --- NEW QUEST GENERATION LOGIC ---
  const generateNewQuests = (currentQuests: Quest[], currentClass: string, lastDaily?: number, lastWeekly?: number, logs: ActivityLog[] = []): { quests: Quest[], lastDaily: number, lastWeekly: number } => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = now.getDay();
    const diff = now.getDate() - day;
    const weekStart = new Date(now.setDate(diff)).setHours(0,0,0,0);

    let newQuests = [...currentQuests];
    let newLastDaily = lastDaily || 0;
    let newLastWeekly = lastWeekly || 0;

    // Helper para definir meta base
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
        if (act.id === 'gym') dailyBase = 3; 
        if (type === 'weekly') return dailyBase * 7;
        return dailyBase;
    };

    // 1. Quests Obrigatórias: Água, Flexão, Abdominal
    const fixedActivityIds = ['water', 'pushup', 'abs'];

    // 2. Quest Dinâmica: Atividade Mais Praticada (que não seja fixa nem ruim)
    const logCounts: Record<string, number> = {};
    logs.forEach(l => { logCounts[l.activityId] = (logCounts[l.activityId] || 0) + 1; });
    const sortedActivities = Object.entries(logCounts).sort((a,b) => b[1] - a[1]);
    
    let mostPracticedId: string | null = null;
    for (const [id] of sortedActivities) {
        if (!fixedActivityIds.includes(id) && id !== 'sleep') {
            const act = ACTIVITIES.find(a => a.id === id);
            if (act && !act.category.includes('bad')) {
                mostPracticedId = id;
                break;
            }
        }
    }

    // Se não tiver histórico, pega uma da classe ou 'run'
    if (!mostPracticedId) {
        if (currentClass.includes('Mago')) mostPracticedId = 'study';
        else if (currentClass.includes('Corredor')) mostPracticedId = 'run';
        else mostPracticedId = 'run'; // Default
    }

    const dailyActivityList = [...fixedActivityIds, mostPracticedId].filter(Boolean);

    // Gerar Diárias
    if (!lastDaily || lastDaily < todayStart) {
        newQuests = newQuests.filter(q => q.type !== 'daily'); // Limpa antigas
        
        dailyActivityList.forEach(id => {
            const act = ACTIVITIES.find(a => a.id === id);
            if (act) {
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
            }
        });
        newLastDaily = Date.now();
    }

    // Gerar Semanais (Soma das Diárias x 7)
    if (!lastWeekly || lastWeekly < weekStart) {
        newQuests = newQuests.filter(q => q.type !== 'weekly'); // Limpa antigas
        
        dailyActivityList.forEach(id => {
            const act = ACTIVITIES.find(a => a.id === id);
            if (act) {
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
            }
        });
        newLastWeekly = Date.now();
    }

    return { quests: newQuests, lastDaily: newLastDaily, lastWeekly: newLastWeekly };
  };

  const calculateBmiBonus = (weight: number, height: number): number => {
    if (weight <= 0 || height <= 0) return 0;
    const heightM = height / 100;
    const bmi = weight / (heightM * heightM);
    if (bmi > 40.0) return 20; if (bmi >= 30.0) return 15; if (bmi >= 25.0) return 10; if (bmi >= 23.41) return 5; return 0;
  };

  const applyAtrophySystem = (state: GameState): { newState: GameState, lostAttributes: string[] } => {
    const now = Date.now(); const lastCheck = state.lastAtrophyCheck || 0; const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    if (now - lastCheck < ONE_DAY_MS) return { newState: state, lostAttributes: [] };
    const newAttributes = { ...state.attributes }; const lostAttrs: string[] = []; const lastTrained: Record<string, number> = {};
    const attributeKeys = Object.keys(newAttributes) as Attribute[]; attributeKeys.forEach(attr => lastTrained[attr] = 0);
    for (const log of state.logs) {
        const act = ACTIVITIES.find(a => a.id === log.activityId);
        if (act) { if (act.primaryAttribute && log.timestamp > (lastTrained[act.primaryAttribute] || 0)) lastTrained[act.primaryAttribute] = log.timestamp; if (act.secondaryAttribute && log.timestamp > (lastTrained[act.secondaryAttribute] || 0)) lastTrained[act.secondaryAttribute] = log.timestamp; }
    }
    attributeKeys.forEach(attr => {
        const lastTime = lastTrained[attr]; const effectiveLastTime = lastTime === 0 ? now : lastTime;
        const daysSince = (now - effectiveLastTime) / ONE_DAY_MS; const threshold = ATROPHY_THRESHOLDS[attr];
        if (daysSince > threshold) { if (newAttributes[attr] > 0) { newAttributes[attr] = Math.max(0, newAttributes[attr] - 1); lostAttrs.push(attr); } }
    });
    return { newState: { ...state, attributes: newAttributes, lastAtrophyCheck: now }, lostAttributes: lostAttrs };
  };

  const getDayLabel = (timestamp: number) => {
    const date = new Date(timestamp); const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
    const check = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    if (check === today) return "Hoje"; if (check === yesterday) return "Ontem"; return date.toLocaleDateString();
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('liferpg_user');
    const savedGame = localStorage.getItem('liferpg_game');
    const needsSync = localStorage.getItem('liferpg_needs_sync') === 'true';
    if (savedUser) setUser(JSON.parse(savedUser));
    if (savedGame) {
        const parsedGame = JSON.parse(savedGame);
        const safeAttributes = { STR: 0, END: 0, VIG: 0, AGI: 0, DEX: 0, INT: 0, CHA: 0, DRV: 0, ...parsedGame.attributes };
        const currentClass = parsedGame.classTitle || "NPC";
        const initialQuests = parsedGame.quests || [];
        const initialLogs = parsedGame.logs || [];
        
        const { quests, lastDaily, lastWeekly } = generateNewQuests(initialQuests, currentClass, parsedGame.lastDailyQuestGen, parsedGame.lastWeeklyQuestGen, initialLogs);
        
        let loadedState: GameState = { ...parsedGame, classTitle: currentClass, attributes: safeAttributes, quests, lastDailyQuestGen: lastDaily, lastWeeklyQuestGen: lastWeekly };
        const { newState, lostAttributes } = applyAtrophySystem(loadedState);
        loadedState = newState;
        if (lostAttributes.length > 0) setNarratorText(`A inatividade cobrou seu preço. Atributos reduzidos: ${lostAttributes.join(', ')}`);
        setGameState(loadedState);
        if (parsedGame.guildId && navigator.onLine) { subscribeToGuild(parsedGame.guildId, (guild, messages) => { setCurrentGuild(guild); if (messages) setChatMessages(messages); }); }
    } else {
        const { quests, lastDaily, lastWeekly } = generateNewQuests([], "NPC", 0, 0, []);
        setGameState(prev => ({ ...prev, quests, lastDailyQuestGen: lastDaily, lastWeeklyQuestGen: lastWeekly }));
    }
    const checkLoginErrors = async () => { try { await checkRedirectResult(); } catch (error: any) { alert("Erro login: " + error.message); } };
    checkLoginErrors();
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        setCurrentUser(firebaseUser);
        if (firebaseUser) {
          setIsSyncing(true);
          if (needsSync && savedUser && savedGame) {
              const success = await saveUserDataToCloud(firebaseUser.uid, JSON.parse(savedUser), JSON.parse(savedGame));
              if (success) localStorage.removeItem('liferpg_needs_sync');
              setIsSyncing(false);
          } else {
              const cloudData = await loadUserDataFromCloud(firebaseUser.uid);
              if (cloudData) {
                const u = cloudData.userProfile; setUser(u);
                const cloudGame = cloudData.gameState;
                const safeAttributes = { STR: 0, END: 0, VIG: 0, AGI: 0, DEX: 0, INT: 0, CHA: 0, DRV: 0, ...cloudGame.attributes };
                const currentClass = cloudGame.classTitle || "NPC";
                const { quests, lastDaily, lastWeekly } = generateNewQuests(cloudGame.quests || [], currentClass, cloudGame.lastDailyQuestGen, cloudGame.lastWeeklyQuestGen, cloudGame.logs || []);
                let newState: GameState = { ...cloudGame, attributes: safeAttributes, quests, lastDailyQuestGen: lastDaily, lastWeeklyQuestGen: lastWeekly };
                const { newState: atrophiedState, lostAttributes } = applyAtrophySystem(newState);
                newState = atrophiedState;
                if (lostAttributes.length > 0) setNarratorText(`A inatividade cobrou seu preço. -1 em: ${lostAttributes.join(', ')}`);
                setGameState(newState); 
                if (cloudGame.guildId) { subscribeToGuild(cloudGame.guildId, (guild, messages) => { setCurrentGuild(guild); if (messages) setChatMessages(messages); }); }
                fetchActiveDuels(firebaseUser.uid, (activeDuels) => { setDuels(activeDuels); });
                if (!hasNarratorRunRef.current && lostAttributes.length === 0) { hasNarratorRunRef.current = true; updateNarrator(u, newState, undefined, 'login'); }
              } else { if (savedUser && savedGame) await saveUserDataToCloud(firebaseUser.uid, JSON.parse(savedUser), JSON.parse(savedGame)); }
              setIsSyncing(false);
          }
        }
      });
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => { if (user) { localStorage.setItem('liferpg_user', JSON.stringify(user)); if (currentUser && gameState) saveUserDataToCloud(currentUser.uid, user, gameState).then(s => { if(!s) localStorage.setItem('liferpg_needs_sync', 'true'); }); } }, [user]);
  useEffect(() => { if (gameState) { localStorage.setItem('liferpg_game', JSON.stringify(gameState)); if (currentUser && user) saveUserDataToCloud(currentUser.uid, user, gameState).then(s => { if(!s) localStorage.setItem('liferpg_needs_sync', 'true'); }); } }, [gameState]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages, isGuildModalOpen, guildTab]);

  // Admin Loading
  const handleOpenAdmin = async () => {
    setIsAdminModalOpen(true);
    const list = await getGlobalRanking(); // Reuse this to get all users roughly
    setUserList(list);
  };

  const handleGoogleLogin = async () => { try { await loginWithGoogle(); } catch (e: any) { alert("Erro ao iniciar login: " + e.message); } };
  const handleLogin = async (e: React.FormEvent) => { e.preventDefault(); try { await loginWithEmail(authEmail, authPassword); } catch (e: any) { alert("Erro Login: " + e.message); } };
  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (authPassword !== authConfirmPassword) { alert("As senhas não conferem!"); return; }
      if (authPassword.length < 6) { alert("A senha deve ter pelo menos 6 caracteres."); return; }
      const formData = new FormData(e.currentTarget);
      const name = formData.get('name') as string;
      const gender = formData.get('gender') as Gender;
      const dob = formData.get('dob') as string;
      const profession = formData.get('profession') as string;
      const weight = Number(formData.get('weight'));
      const height = Number(formData.get('height'));
      try {
          const firebaseUser = await registerWithEmail(authEmail, authPassword);
          const newUser: UserProfile = { name, dob, weight, height, gender, profession };
          const bmiBonus = calculateBmiBonus(weight, height);
          const initialAttributes = { ...gameState.attributes }; if (bmiBonus > 0) initialAttributes.END = bmiBonus;
          const newGameState: GameState = { ...gameState, attributes: initialAttributes };
          const { quests } = generateNewQuests([], "NPC", 0, 0, []);
          newGameState.quests = quests;
          setUser(newUser); setGameState(newGameState); setCurrentUser(firebaseUser);
          await saveUserDataToCloud(firebaseUser.uid, newUser, newGameState);
          updateNarrator(newUser, newGameState, undefined, 'login');
      } catch (e: any) { alert("Erro ao criar conta: " + e.message); }
  };
  const handleLogout = async () => {
    await logoutUser(); localStorage.removeItem('liferpg_user'); localStorage.removeItem('liferpg_game'); localStorage.removeItem('liferpg_needs_sync');
    setUser(null); setCurrentUser(null);
    setGameState({ level: 1, currentXp: 0, totalXp: 0, logs: [], classTitle: "NPC", attributes: { STR: 0, END: 0, VIG: 0, AGI: 0, DEX: 0, INT: 0, CHA: 0, DRV: 0 }, activeBuff: null, quests: [], guildId: undefined });
    setCurrentGuild(null); setChatMessages([]); setAuthView('login'); setNarratorText("Até a próxima jornada.");
  };

  const calculateXpForNextLevel = (level: number) => { return level * XP_FOR_NEXT_LEVEL_BASE; };
  const determineClass = (attrs: Record<Attribute, number>, weight: number, height: number, logs: ActivityLog[]): string => {
      let maxAttr: Attribute = 'STR'; let maxVal = -1;
      for (const key of Object.keys(attrs) as Attribute[]) { if (attrs[key] > maxVal) { maxVal = attrs[key]; maxAttr = key; } }
      if (maxVal < 10) return "NPC";
      let secondMaxAttr: Attribute | null = null; let secondMaxVal = -1;
      for (const key of Object.keys(attrs) as Attribute[]) { if (key !== maxAttr && attrs[key] > secondMaxVal) { secondMaxVal = attrs[key]; secondMaxAttr = key; } }
      const isSecondaryRelevant = secondMaxAttr && secondMaxVal > (maxVal * 0.4);
      const heightM = height / 100; const bmi = weight > 0 && height > 0 ? weight / (heightM * heightM) : 22;
      let combatCount = 0; let fitnessCount = 0;
      logs.slice(0, 50).forEach(log => { const act = ACTIVITIES.find(a => a.id === log.activityId); if (act?.category === 'combat') combatCount++; if (act?.category === 'fitness') fitnessCount++; });
      switch (maxAttr) {
          case 'STR':
              if (bmi >= 28 && isSecondaryRelevant && secondMaxAttr === 'END') return "Tanque"; 
              if (bmi >= 28 && !isSecondaryRelevant) return "Tanque";
              if (isSecondaryRelevant && secondMaxAttr === 'DEX') return "Lutador";
              if (isSecondaryRelevant && secondMaxAttr === 'AGI') return "Berseker";
              if (combatCount > fitnessCount) return "Lutador";
              if (fitnessCount > combatCount) return "Guerreiro";
              return "Guerreiro";
          case 'VIG':
              if (isSecondaryRelevant && secondMaxAttr === 'STR') return "Biker"; 
              if (isSecondaryRelevant && secondMaxAttr === 'AGI') return "Corredor";
              return "Corredor";
          case 'END':
               if (isSecondaryRelevant && secondMaxAttr === 'STR') { if (bmi >= 28) return "Tanque"; return "Crossfitter"; }
               return "Atleta de Resistência";
          case 'AGI':
              if (isSecondaryRelevant && secondMaxAttr === 'DEX') return "Espadachim";
              return "Velocista";
          case 'DEX':
              if (isSecondaryRelevant && secondMaxAttr === 'STR') return "Lutador";
              if (isSecondaryRelevant && secondMaxAttr === 'AGI') return "Espadachim";
              return "Atirador";
          case 'INT': return "Mago";
          case 'CHA': if (isSecondaryRelevant && secondMaxAttr === 'INT') return "Conselheiro"; return "Healer";
          case 'DRV': return "Motorista";
          default: return "Aventureiro";
      }
  };

  const handleUpdateProfile = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!user) return;
    const formData = new FormData(e.currentTarget); const newWeight = Number(formData.get('weight')); const newHeight = Number(formData.get('height'));
    const oldBonus = calculateBmiBonus(user.weight, user.height); const newBonus = calculateBmiBonus(newWeight, newHeight); const bonusDiff = newBonus - oldBonus;
    const updatedUser: UserProfile = { ...user, weight: newWeight, height: newHeight, gender: formData.get('gender') as Gender, profession: formData.get('profession') as string, };
    if (bonusDiff !== 0) { setGameState(prev => ({ ...prev, attributes: { ...prev.attributes, END: Math.max(0, (prev.attributes.END || 0) + bonusDiff) } })); }
    const newClassTitle = determineClass(gameState.attributes, newWeight, newHeight, gameState.logs);
    setUser(updatedUser); setGameState(prev => ({ ...prev, classTitle: newClassTitle }));
    setIsEditingProfile(false); setNarratorText(`Perfil atualizado! Você parece diferente, ${updatedUser.name}.`);
  };
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => { const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 300; const ctx = canvas.getContext('2d'); ctx?.drawImage(img, 0, 0, 300, 300); setUser({ ...user, avatarImage: canvas.toDataURL('image/jpeg', 0.8) }); };
        img.src = event.target.result as string;
    };
    reader.readAsDataURL(file);
  };
  const updateNarrator = async (u: UserProfile, g: GameState, activityName?: string, trigger: NarratorTrigger = 'activity') => {
    if (!isOnline) { if (trigger === 'login') setNarratorText("Bem-vindo ao modo offline."); else setNarratorText("Atividade registrada localmente."); return; }
    setLoadingAi(true); try { const text = await generateRpgFlavorText(u, g, trigger, activityName); setNarratorText(text); } catch (err) { console.error(err); } finally { setLoadingAi(false); }
  };
  
  const handleLogActivity = async () => {
    if (!selectedActivity || !user) return;
    let amount = 0; let xpGained = 0; let details: ActivityLog['details'] | undefined = undefined;
    const newAttributes = { ...gameState.attributes };
    
    if (selectedActivity.category === 'bad_habit') {
        const now = Date.now(); let buffMultiplier = 1; let buffDurationHours = 0; let debuffName = "";
        if (selectedActivity.id === 'alcohol') { buffMultiplier = 0.5; buffDurationHours = 12; debuffName = "Ressaca"; } 
        else if (selectedActivity.id === 'smoke') { buffMultiplier = 0.7; buffDurationHours = 4; debuffName = "Fôlego Curto"; } 
        else if (selectedActivity.id === 'junk_food') { buffMultiplier = 0.8; buffDurationHours = 3; debuffName = "Digestão Pesada"; }
        const expireDate = now + (buffDurationHours * 60 * 60 * 1000);
        setGameState(prev => ({ ...prev, activeBuff: { multiplier: buffMultiplier, expiresAt: expireDate, description: `${debuffName}: ${Math.round((buffMultiplier - 1) * 100)}% XP` } }));
        amount = Number(inputAmount) || 1; xpGained = 0;
        const newLog: ActivityLog = { id: Date.now().toString(), activityId: selectedActivity.id, amount, xpGained, timestamp: Date.now() };
        setGameState(prev => ({ ...prev, logs: [newLog, ...prev.logs].slice(0, 50) }));
        setIsActivityModalOpen(false); setNarratorText(`Hábito nocivo registrado.`); return;
    }

    if (selectedActivity.id === 'gym') {
        const weight = Number(gymWeight) || 0; const reps = Number(gymReps) || 0; if (reps <= 0) return;
        amount = 1; const effectiveWeight = weight > 0 ? weight : 10; xpGained = Math.floor((effectiveWeight * reps) / 5) + 5; 
        details = { exercise: gymExercise || 'Exercício', weight: weight, reps: reps, restTime: 0 };
        const attributePoints = Math.ceil(xpGained / 5);
        if (reps <= 6) { newAttributes.STR = (newAttributes.STR || 0) + attributePoints; newAttributes.END = (newAttributes.END || 0) + Math.ceil(attributePoints * 0.5); } 
        else if (reps >= 7 && reps <= 9) { newAttributes.STR = (newAttributes.STR || 0) + Math.ceil(attributePoints * 0.7); newAttributes.END = (newAttributes.END || 0) + Math.ceil(attributePoints * 0.7); } 
        else { newAttributes.END = (newAttributes.END || 0) + attributePoints; newAttributes.STR = (newAttributes.STR || 0) + Math.ceil(attributePoints * 0.5); }
        
        // Timer Logic with Timestamp
        const [mins, secs] = gymRestTime.split(':').map(Number); 
        const totalSecs = (mins * 60) + secs; 
        if (totalSecs > 0) { 
            const endTime = Date.now() + (totalSecs * 1000);
            setRestEndTime(endTime);
        }
    } else if (selectedActivity.id === 'run') {
        const distance = Number(runDistance) || 0; if (distance <= 0) return;
        const [minsStr, secsStr] = runDuration.split(':'); const totalMinutes = (Number(minsStr) || 0) + ((Number(secsStr) || 0) / 60); if (totalMinutes <= 0) return;
        amount = distance; const pace = totalMinutes / distance; 
        let baseXp = Math.floor(distance * selectedActivity.xpPerUnit);
        let paceMultiplier = 1; if (pace <= 3.75) paceMultiplier = 1.5; else if (pace <= 4.5) paceMultiplier = 1.2;
        xpGained = Math.floor(baseXp * paceMultiplier);
        const paceMins = Math.floor(pace); const paceSecs = Math.round((pace - paceMins) * 60);
        details = { distance: distance, duration: runDuration, pace: `${paceMins}:${paceSecs.toString().padStart(2, '0')} /km` };
        const pointsEarned = Math.ceil(amount * paceMultiplier); newAttributes.VIG = (newAttributes.VIG || 0) + pointsEarned;
        if (pace <= 4.5) newAttributes.AGI = (newAttributes.AGI || 0) + Math.ceil(pointsEarned * 0.7); else newAttributes.AGI = (newAttributes.AGI || 0) + Math.ceil(pointsEarned * 0.3);
    } else if (['shooting', 'archery', 'knife_throw'].includes(selectedActivity.id)) {
        const dist = Number(targetDistance) || 0; const totalShots = targetHits.center + targetHits.c1 + targetHits.c2 + targetHits.c3 + targetHits.outer; if (totalShots <= 0 || dist <= 0) return;
        const rawScore = (targetHits.center * 10) + (targetHits.c1 * 5) + (targetHits.c2 * 3) + (targetHits.c3 * 2) + (targetHits.outer * 1);
        let distanceFactor = 1; const tool = targetTool.toLowerCase();
        if (selectedActivity.id === 'shooting') { if (tool === 'curta') distanceFactor = 1 + (dist / 10); else if (tool === 'espingarda') distanceFactor = 1 + (dist / 25); else distanceFactor = 1 + (dist / 50); } 
        else if (selectedActivity.id === 'archery') { if (tool === 'composto') distanceFactor = 1 + (dist / 30); else if (tool === 'recurvo') distanceFactor = 1.2 + (dist / 20); else if (tool === 'longbow') distanceFactor = 1.5 + (dist / 20); else if (tool === 'besta') distanceFactor = 1 + (dist / 40); } 
        else if (selectedActivity.id === 'knife_throw') { if (dist <= 3) distanceFactor = 1; else distanceFactor = 1 + (dist / 3); }
        xpGained = Math.ceil(rawScore * distanceFactor * 0.2); if (selectedActivity.id === 'knife_throw') xpGained = Math.ceil(xpGained * 1.2);
        amount = 1; details = { weapon: targetTool, distance: dist, hits: { ...targetHits } };
        const attrPoints = Math.ceil(xpGained / 3);
        if (selectedActivity.id === 'shooting') { newAttributes.DEX = (newAttributes.DEX || 0) + attrPoints; if (tool === 'curta' || tool === 'longa') newAttributes.INT = (newAttributes.INT || 0) + Math.ceil(attrPoints * 0.5); else newAttributes.STR = (newAttributes.STR || 0) + Math.ceil(attrPoints * 0.5); } 
        else if (selectedActivity.id === 'archery') { newAttributes.DEX = (newAttributes.DEX || 0) + attrPoints; newAttributes.STR = (newAttributes.STR || 0) + Math.ceil(attrPoints * 0.6); } 
        else if (selectedActivity.id === 'knife_throw') { newAttributes.DEX = (newAttributes.DEX || 0) + attrPoints; newAttributes.AGI = (newAttributes.AGI || 0) + Math.ceil(attrPoints * 0.5); }
    } else {
        if (!inputAmount || isNaN(Number(inputAmount))) return;
        amount = Number(inputAmount); xpGained = Math.floor(amount * selectedActivity.xpPerUnit);
        let pointsEarned = Math.ceil(amount); if (selectedActivity.id === 'drive') pointsEarned = Math.floor(amount / 50);
        if (selectedActivity.primaryAttribute) newAttributes[selectedActivity.primaryAttribute] = (newAttributes[selectedActivity.primaryAttribute] || 0) + pointsEarned;
        if (selectedActivity.secondaryAttribute) newAttributes[selectedActivity.secondaryAttribute] = (newAttributes[selectedActivity.secondaryAttribute] || 0) + Math.ceil(pointsEarned * 0.5);
    }

    let buffApplied = false;
    if (gameState.activeBuff && Date.now() < gameState.activeBuff.expiresAt) { xpGained = Math.floor(xpGained * gameState.activeBuff.multiplier); buffApplied = true; }
    
    const newLog: ActivityLog = { id: Date.now().toString(), activityId: selectedActivity.id, amount, xpGained, timestamp: Date.now(), details: details };
    let newCurrentXp = gameState.currentXp + xpGained; let newTotalXp = gameState.totalXp + xpGained; let newLevel = gameState.level; let leveledUp = false;
    let xpNeeded = calculateXpForNextLevel(newLevel);
    while (newCurrentXp >= xpNeeded) { newCurrentXp -= xpNeeded; newLevel++; xpNeeded = calculateXpForNextLevel(newLevel); leveledUp = true; }
    const updatedQuests = gameState.quests.map(q => { if (!q.isClaimed && q.activityId === selectedActivity.id) return { ...q, currentAmount: q.currentAmount + amount }; return q; });
    const updatedLogs = [newLog, ...gameState.logs].slice(0, 50);
    const newClassTitle = determineClass(newAttributes, user.weight, user.height, updatedLogs);
    const activeBuff = (gameState.activeBuff && Date.now() < gameState.activeBuff.expiresAt) ? gameState.activeBuff : null;
    const newState = { ...gameState, level: newLevel, currentXp: newCurrentXp, totalXp: newTotalXp, logs: updatedLogs, attributes: newAttributes, classTitle: newClassTitle, activeBuff: activeBuff, quests: updatedQuests };

    setGameState(newState);
    if (currentUser) updateDuelProgress(currentUser.uid, selectedActivity.id, amount);
    if (selectedActivity.id !== 'gym') { setIsActivityModalOpen(false); setInputAmount(''); setRunDistance(''); setRunDuration(''); setTargetDistance(''); setTargetHits({ center: 0, c1: 0, c2: 0, c3: 0, outer: 0 }); setSelectedActivity(null); }
    if (leveledUp) { setShowLevelUp(true); setTimeout(() => setShowLevelUp(false), 5000); updateNarrator(user!, newState, "LEVEL UP", 'level_up'); } 
    else { if (selectedActivity.id !== 'gym') updateNarrator(user!, newState, selectedActivity.label + (buffApplied ? " (Buffado)" : ""), 'activity'); }
  };

  const handleDeleteLog = (logId: string) => { 
      if (!window.confirm("Tem certeza?")) return;
      const logToDelete = gameState.logs.find(l => l.id === logId); if (!logToDelete || !user) return;
      let newTotalXp = Math.max(0, gameState.totalXp - logToDelete.xpGained);
      let newLevel = 1; let xpAccumulator = 0; let xpForNext = calculateXpForNextLevel(1);
      while (xpAccumulator + xpForNext <= newTotalXp) { xpAccumulator += xpForNext; newLevel++; xpForNext = calculateXpForNextLevel(newLevel); }
      let newCurrentXp = newTotalXp - xpAccumulator;
      const newAttributes = { ...gameState.attributes }; 
      const updatedLogs = gameState.logs.filter(l => l.id !== logId);
      setGameState(prev => ({ ...prev, level: newLevel, currentXp: newCurrentXp, totalXp: newTotalXp, logs: updatedLogs, attributes: newAttributes }));
  };
  const handleClaimQuest = (questId: string) => { 
      const quest = gameState.quests.find(q => q.id === questId); if (!quest || quest.isClaimed) return;
      const xpGained = quest.xpReward; let newCurrentXp = gameState.currentXp + xpGained; let newTotalXp = gameState.totalXp + xpGained; let newLevel = gameState.level;
      let leveledUp = false; let xpNeeded = calculateXpForNextLevel(newLevel);
      while (newCurrentXp >= xpNeeded) { newCurrentXp -= xpNeeded; newLevel++; xpNeeded = calculateXpForNextLevel(newLevel); leveledUp = true; }
      const updatedQuests = gameState.quests.map(q => q.id === questId ? { ...q, isClaimed: true } : q);
      setGameState({ ...gameState, level: newLevel, currentXp: newCurrentXp, totalXp: newTotalXp, quests: updatedQuests });
      if (leveledUp) { setShowLevelUp(true); setTimeout(() => setShowLevelUp(false), 5000); }
  };
  const handleRegisterSleep = () => { 
      const [bedH, bedM] = bedTime.split(':').map(Number); const [wakeH, wakeM] = wakeTime.split(':').map(Number);
      let sleepDuration = 0; const bedMinutes = bedH * 60 + bedM; const wakeMinutes = wakeH * 60 + wakeM;
      if (wakeMinutes >= bedMinutes) sleepDuration = (wakeMinutes - bedMinutes) / 60; else sleepDuration = ((1440 - bedMinutes) + wakeMinutes) / 60;
      let percentage = 0; if (sleepDuration <= 9) percentage = sleepDuration * 2; else { const base = 18; const penalty = (sleepDuration - 9) * 2; percentage = Math.max(0, base - penalty); }
      const multiplier = 1 + (percentage / 100); const now = new Date(); const expireDate = new Date(); expireDate.setHours(bedH, bedM, 0, 0); if (expireDate.getTime() < now.getTime()) { if (now.getHours() > bedH) expireDate.setDate(expireDate.getDate() + 1); }
      setGameState(prev => ({ ...prev, quests: prev.quests.map(q => q.activityId === 'sleep' && !q.isClaimed ? { ...q, currentAmount: q.currentAmount + 1 } : q), activeBuff: { multiplier: Number(multiplier.toFixed(2)), expiresAt: expireDate.getTime(), description: `Buff de Sono: +${percentage.toFixed(0)}% XP` } }));
      setIsSleepModalOpen(false); setNarratorText(`Sono registrado!`);
  };
  const handleCreateGuild = async () => { if (!isOnline || !currentUser || !guildCreateName) return; const gid = await createGuild(guildCreateName, currentUser.uid, user!.name, user!.avatarImage, gameState.classTitle, gameState.level); if (gid) setGameState(prev => ({ ...prev, guildId: gid })); };
  const handleJoinGuild = async () => { if (!isOnline || !currentUser || !guildInputId) return; const success = await joinGuild(guildInputId, currentUser.uid, user!.name, user!.avatarImage, gameState.classTitle, gameState.level); if (success) { setGameState(prev => ({ ...prev, guildId: guildInputId })); setGuildInputId(''); } else alert("Erro ao entrar."); };
  const handleSendMessage = async () => { if (!currentUser || !currentGuild || !chatInput.trim()) return; await sendMessage(currentGuild.id, currentUser.uid, user!.name, chatInput); setChatInput(''); };
  const handleAttackBoss = async () => { if (!isOnline || !currentUser || !currentGuild?.boss) return; await attackBoss(currentGuild.id, 10 + (gameState.level * 2), user!.name); };
  const handleLoadRanking = async () => { if (!isOnline) return; const list = await getGlobalRanking(rankFilter); setRankingList(list); };
  useEffect(() => { if (isRankModalOpen) handleLoadRanking(); }, [isRankModalOpen, rankFilter]);

  const handleOpenChallenge = (opponent: PublicProfile) => { setChallengeOpponent(opponent); setChallengeActivityId('pushup'); setChallengeTarget('20'); setIsChallengeModalOpen(true); setIsRankModalOpen(false); setViewingProfile(null); };
  const handleSubmitChallenge = async () => { if (!currentUser || !user || !challengeOpponent) return; const target = Number(challengeTarget); if (target <= 0) { alert("Meta inválida"); return; } await createDuel(currentUser.uid, user.name, challengeOpponent.uid, challengeOpponent.name, challengeActivityId, target); setIsChallengeModalOpen(false); setChallengeOpponent(null); };
  const handleAcceptDuel = async (duel: Duel) => { await acceptDuel(duel.id); };
  const handleCancelDuel = async (duelId: string) => { if(window.confirm("Deseja cancelar/recusar este duelo?")) { await cancelDuel(duelId); } };

  // --- Map & Territory Functions ---
  const handleCreateTerritory = async () => {
      if (!userLocation) return;
      await createTerritory(newTerritoryName, userLocation.lat, userLocation.lng, newTerritoryRadius, newEnemyName, newEnemyHp);
      setNewTerritoryName(''); setIsAdminModalOpen(false); alert("Território criado!");
  };
  const handleAttackTerritory = async () => {
      if (!selectedTerritory || !currentUser || !user) return;
      // Calcula XP/Dano. Para MVP, usamos um valor fixo ou baseado no level.
      const damage = 20 + (gameState.level * 2); 
      await attackTerritoryTarget(selectedTerritory.id, damage, currentUser.uid, user.name);
      // Simulate XP gain from combat
      const xp = 50; 
      const newXp = gameState.currentXp + xp;
      // ... XP logic simplified for brevity ...
      alert(`Você atacou o ${selectedTerritory.activeEnemy.name}! Causou ${damage} de dano.`);
  };

  const getAvatarUrl = useMemo(() => { if (!user) return ''; if (user.avatarImage) return user.avatarImage; return `https://api.dicebear.com/9.x/micah/svg?seed=${user.name.replace(/\s/g, '')}`; }, [user]);
  const isBuffActive = gameState.activeBuff && Date.now() < gameState.activeBuff.expiresAt;
  const buffPercentage = isBuffActive ? Math.round((gameState.activeBuff!.multiplier - 1) * 100) : 0;
  const isDebuff = isBuffActive && gameState.activeBuff!.multiplier < 1;
  const xpNeeded = calculateXpForNextLevel(gameState.level);
  const dailyQuests = gameState.quests.filter(q => q.type === 'daily');
  const basicDailyQuests = dailyQuests.filter(q => { const act = ACTIVITIES.find(a => a.id === q.activityId); return q.activityId === 'sleep' || (act && !act.primaryAttribute); }).sort((a, b) => { if (a.activityId === 'sleep') return -1; if (b.activityId === 'sleep') return 1; return 0; });
  const advancedDailyQuests = dailyQuests.filter(q => { const act = ACTIVITIES.find(a => a.id === q.activityId); return q.activityId !== 'sleep' && (act && !!act.primaryAttribute); });
  const weeklyQuests = gameState.quests.filter(q => q.type === 'weekly');
  const unclaimedQuestsCount = gameState.quests.filter(q => q.currentAmount >= q.targetAmount && !q.isClaimed).length;
  const currentPace = useMemo(() => { if (!runDistance || !runDuration) return "0:00"; const d = Number(runDistance); const [m, s] = runDuration.split(':').map(Number); const totalMin = (m || 0) + ((s || 0) / 60); if (d <= 0 || totalMin <= 0) return "0:00"; const p = totalMin / d; const pM = Math.floor(p); const pS = Math.round((p - pM) * 60); return `${pM}:${pS.toString().padStart(2, '0')}`; }, [runDistance, runDuration]);

  if (!user) {
     return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
            <div className="w-full max-w-md space-y-6">
                <div className="text-center"><h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500 mb-2">LifeRPG</h1></div>
                <div className="bg-slate-900/80 p-6 rounded-2xl shadow-xl border border-slate-800 backdrop-blur-sm">
                    <div className="flex border-b border-slate-700 mb-6">
                        <button onClick={() => setAuthView('login')} className={`flex-1 pb-2 text-sm font-bold uppercase ${authView === 'login' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}>Já tenho conta</button>
                        <button onClick={() => setAuthView('register')} className={`flex-1 pb-2 text-sm font-bold uppercase ${authView === 'register' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}>Nova Jornada</button>
                    </div>
                    {authView === 'login' ? (
                        <form onSubmit={handleLogin} className="space-y-4">
                            <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" placeholder="Email" />
                            <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" placeholder="Senha" />
                            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl">Entrar</button>
                            <button type="button" onClick={handleGoogleLogin} className="w-full bg-slate-800 text-white py-3 rounded-xl flex items-center justify-center gap-2">{getIcon("User", "w-4 h-4")} Google</button>
                        </form>
                    ) : (
                        <form onSubmit={handleRegister} className="space-y-4">
                             <input name="name" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2" placeholder="Nome Herói" />
                             <div className="grid grid-cols-2 gap-2"><select name="gender" className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"><option>Masculino</option><option>Feminino</option><option>Outros</option></select><input type="date" name="dob" className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-white" /></div>
                             <input name="profession" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2" placeholder="Profissão" />
                             <div className="grid grid-cols-2 gap-2"><input type="number" name="weight" step="0.1" required className="bg-slate-950 border border-slate-700 rounded-lg p-2" placeholder="Peso" /><input type="number" name="height" required className="bg-slate-950 border border-slate-700 rounded-lg p-2" placeholder="Altura" /></div>
                             <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2" placeholder="Email" />
                             <div className="grid grid-cols-2 gap-2"><input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required className="bg-slate-950 border border-slate-700 rounded-lg p-2" placeholder="Senha" /><input type="password" value={authConfirmPassword} onChange={e => setAuthConfirmPassword(e.target.value)} required className={`bg-slate-950 border rounded-lg p-2 ${authPassword!==authConfirmPassword?'border-red-500':'border-slate-700'}`} placeholder="Confirmar" /></div>
                             <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl">Iniciar</button>
                        </form>
                    )}
                </div>
            </div>
        </div>
     );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24 md:pb-6 relative overflow-hidden">
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 cursor-pointer" onClick={() => setIsProfileModalOpen(true)}>
        <div className="max-w-2xl mx-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-slate-700 bg-slate-800 relative">
                  <img src={getAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  {isBuffActive && <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border border-slate-900 ${isDebuff ? 'bg-red-600 animate-pulse' : 'bg-purple-600'}`}></div>}
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight flex items-center gap-2">{user.name}</h1>
                <div className="flex items-center gap-2"><span className="text-xs text-blue-400 font-bold tracking-wider uppercase border border-blue-500/30 px-1.5 py-0.5 rounded bg-blue-500/10">{gameState.classTitle}</span></div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
               <div className="flex gap-2 flex-wrap justify-end">
                   {user.role === 'admin' && (<button onClick={(e) => { e.stopPropagation(); handleOpenAdmin(); }} className="text-[10px] bg-red-900/40 text-red-400 border border-red-700/50 px-2 py-1 rounded flex items-center gap-1">{getIcon("ShieldAlert", "w-3 h-3")} ADMIN</button>)}
                   <button onClick={(e) => { e.stopPropagation(); setIsMapModalOpen(true); }} className="text-[10px] bg-emerald-900/40 text-emerald-400 border border-emerald-700/50 px-2 py-1 rounded flex items-center gap-1">{getIcon("Map", "w-3 h-3")} MAPA</button>
                   <button onClick={(e) => { e.stopPropagation(); setIsRankModalOpen(true); }} className="text-[10px] bg-yellow-900/40 text-yellow-400 border border-yellow-700/50 px-2 py-1 rounded flex items-center gap-1">Rank</button>
                   <button onClick={(e) => { e.stopPropagation(); setIsGuildModalOpen(true); }} className="text-[10px] bg-indigo-900/40 text-indigo-400 border border-indigo-700/50 px-2 py-1 rounded flex items-center gap-1">Clã</button>
                   <button onClick={(e) => { e.stopPropagation(); setIsQuestModalOpen(true); }} className="text-[10px] bg-amber-900/40 text-amber-400 border border-amber-700/50 px-2 py-1 rounded flex items-center gap-1">Quests {unclaimedQuestsCount > 0 && <span className="w-2 h-2 bg-red-500 rounded-full ml-1 animate-pulse"></span>}</button>
                   {currentUser && (
                      <>
                        {isSyncing ? (<div className="text-[10px] text-blue-400 border border-blue-800 px-2 py-1 rounded"><div className="w-2 h-2 bg-blue-500 rounded-full animate-spin"></div></div>) : isOnline ? (<div className="text-[10px] text-emerald-400 border border-emerald-800 px-2 py-1 rounded"><div className="w-2 h-2 bg-emerald-500 rounded-full"></div></div>) : (<div className="text-[10px] text-red-400 border border-red-800 px-2 py-1 rounded"><div className="w-2 h-2 bg-red-500 rounded-full"></div></div>)}
                        <button onClick={(e) => { e.stopPropagation(); handleLogout(); }} className="text-[10px] bg-slate-800 text-slate-300 border border-slate-600 px-2 py-1 rounded flex items-center gap-1 hover:bg-red-900/50 hover:text-red-200">{getIcon("X", "w-3 h-3")} Sair</button>
                      </>
                   )}
               </div>
               <div className="text-right"><div className="text-3xl font-black text-yellow-400 drop-shadow-sm leading-none">{gameState.level}</div><div className="text-[10px] text-slate-500 uppercase tracking-widest">Nível</div></div>
            </div>
          </div>
          <div className="relative pt-1">
             <div className="flex mb-2 items-center justify-between"><span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-100 bg-slate-800 border border-slate-700">XP {gameState.currentXp} / {xpNeeded}</span>{isBuffActive && <span className={`text-xs font-bold ${isDebuff ? 'text-red-400' : 'text-purple-400'} animate-pulse flex items-center gap-1`}>{getIcon(isDebuff ? "TriangleAlert" : "Clock", "w-3 h-3")} {buffPercentage}% XP</span>}</div>
             <ProgressBar current={gameState.currentXp} max={xpNeeded} />
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto p-4 space-y-6">
        <div className="bg-slate-800/40 border border-slate-700 p-4 rounded-xl relative overflow-hidden group"><div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div><div className="flex gap-3"><div className="mt-1 min-w-[24px]">{getIcon("Brain", "w-6 h-6 text-blue-400")}</div><div><p className="text-sm text-slate-100 italic leading-relaxed">"{narratorText}"</p></div></div></div>
        {duels.length > 0 && (<div className="bg-slate-900 border border-red-900/50 p-4 rounded-xl"><h2 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-2">{getIcon("Swords", "w-4 h-4")} Duelos Ativos</h2><div className="space-y-2">{duels.map(duel => (<div key={duel.id} className="bg-slate-800 p-3 rounded-lg flex items-center justify-between"><div className="text-xs w-full"><div className="flex justify-between mb-1"><span className="text-blue-400 font-bold">{duel.challengerName} ({duel.challengerProgress})</span><span className="text-slate-500 text-[10px]">vs</span><span className="text-red-400 font-bold">{duel.opponentName} ({duel.opponentProgress})</span></div><div className="text-[10px] text-slate-400 mb-2">{ACTIVITIES.find(a => a.id === duel.activityId)?.label} - Meta: {duel.targetAmount}</div>{duel.status === 'pending' ? (duel.opponentId === currentUser?.uid ? (<div className="flex gap-2"><button onClick={() => handleAcceptDuel(duel)} className="flex-1 bg-green-600 text-white py-1 rounded text-[10px] font-bold">ACEITAR</button><button onClick={() => handleCancelDuel(duel.id)} className="flex-1 bg-red-600 text-white py-1 rounded text-[10px] font-bold">RECUSAR</button></div>) : (<div className="flex flex-col gap-1"><div className="w-full text-center text-yellow-500 text-[10px]">Aguardando...</div><button onClick={() => handleCancelDuel(duel.id)} className="text-[9px] text-red-400 hover:text-red-300">Cancelar Desafio</button></div>)) : duel.status === 'finished' ? (<div className="w-full text-center font-bold text-yellow-400 text-[10px]">Vencedor: {duel.winnerId === duel.challengerId ? duel.challengerName : duel.opponentName}</div>) : (<div className="w-full h-1 bg-slate-700 rounded-full flex"><div className="bg-blue-500 h-full transition-all" style={{ width: `${Math.min(100, (duel.challengerProgress / duel.targetAmount) * 50)}%`}}></div><div className="bg-red-500 h-full ml-auto transition-all" style={{ width: `${Math.min(100, (duel.opponentProgress / duel.targetAmount) * 50)}%`}}></div></div>)}</div></div>))}</div></div>)}
        <div><h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">{getIcon("Activity", "w-4 h-4")} Painel de Missões</h2>{ACTIVITY_CATEGORIES.map((category) => (<div key={category.id} className="mb-6 last:mb-0"><h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ${category.color} flex items-center gap-2 pl-1 border-l-2 border-slate-700`}>{getIcon(category.icon, "w-4 h-4")} {category.label}</h3><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{ACTIVITIES.filter(act => category.types.includes(act.category)).map((act) => (<button key={act.id} onClick={() => { if (act.id === 'sleep') setIsSleepModalOpen(true); else { setSelectedActivity(act); setIsActivityModalOpen(true); setTargetTool(act.id === 'shooting' ? 'curta' : act.id === 'archery' ? 'recurvo' : act.id === 'knife_throw' ? 'sem_giro' : ''); } }} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95 group"><div className={`p-3 rounded-full bg-slate-900 group-hover:bg-slate-800 transition-colors ${category.color}`}>{getIcon(act.icon)}</div><span className="text-xs font-bold text-center">{act.label}</span></button>))}</div></div>))}</div>
      </main>

      <Modal isOpen={isRankModalOpen} onClose={() => { setIsRankModalOpen(false); setViewingProfile(null); }} title="Ranking Global" large>
           {viewingProfile ? (<div className="space-y-6"><button onClick={() => setViewingProfile(null)} className="text-xs text-blue-400 flex items-center gap-1 mb-4">{getIcon("ChevronLeft", "w-4 h-4")} Voltar</button><div className="flex flex-col items-center text-center"><div className="w-24 h-24 rounded-full overflow-hidden border-4 border-slate-700 mb-3"><img src={viewingProfile.avatarImage || `https://api.dicebear.com/9.x/micah/svg?seed=${viewingProfile.name.replace(/\s/g, '')}`} className="w-full h-full object-cover" /></div><h2 className="text-2xl font-bold text-white">{viewingProfile.name}</h2><span className="text-sm text-blue-400 font-bold uppercase tracking-wider">{viewingProfile.classTitle} • Lvl {viewingProfile.level}</span></div><div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800"><h3 className="text-xs font-bold text-slate-400 uppercase mb-2 text-center">Atributos</h3><RadarChart attributes={viewingProfile.attributes} /></div>{currentUser && (<button onClick={() => handleOpenChallenge(viewingProfile)} className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2">{getIcon("Swords")} Desafiar para Duelo</button>)}</div>) : (<div><div className="flex gap-2 overflow-x-auto pb-4 mb-2">{['Todos', ...RPG_CLASSES].map(c => (<button key={c} onClick={() => setRankFilter(c)} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${rankFilter === c ? 'bg-yellow-500 text-black' : 'bg-slate-800 text-slate-400'}`}>{c}</button>))}</div><div className="space-y-2">{rankingList.map((p, index) => (<div key={p.uid} onClick={() => setViewingProfile(p)} className="bg-slate-800 p-3 rounded-lg flex items-center gap-3 cursor-pointer hover:bg-slate-700 border border-transparent hover:border-slate-600"><div className="flex-shrink-0 w-8 h-8 flex items-center justify-center font-black text-slate-500 bg-slate-900 rounded-full">{index + 1}</div><div className="w-10 h-10 rounded-full overflow-hidden bg-slate-900"><img src={p.avatarImage || `https://api.dicebear.com/9.x/micah/svg?seed=${p.name.replace(/\s/g, '')}`} className="w-full h-full object-cover" /></div><div className="flex-1 min-w-0"><h4 className="font-bold text-white truncate">{p.name}</h4><p className="text-xs text-blue-400">{p.classTitle} • Lvl {p.level}</p></div><div className="text-right"><span className="text-xs font-bold text-yellow-500">{Math.floor(p.totalXp / 1000)}k XP</span></div></div>))}</div></div>)}
      </Modal>
      <Modal isOpen={isChallengeModalOpen} onClose={() => setIsChallengeModalOpen(false)} title={`Desafiar ${challengeOpponent?.name}`}>
          <div className="space-y-4"><div><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Escolha a Atividade</label><select value={challengeActivityId} onChange={e => setChallengeActivityId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white"><option value="pushup">Flexões</option><option value="abs">Abdominais</option><option value="squat">Agachamentos</option><option value="run">Corrida (km)</option><option value="walk">Caminhada (km)</option><option value="water">Hidratação (copos)</option></select></div><div><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Meta para Vencer</label><input type="number" value={challengeTarget} onChange={e => setChallengeTarget(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" placeholder="Ex: 50" /><p className="text-[10px] text-slate-500 mt-1">Quem atingir esta quantidade primeiro vence.</p></div><button onClick={handleSubmitChallenge} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">{getIcon("Swords", "w-5 h-5")} ENVIAR DESAFIO</button></div>
      </Modal>
      <Modal isOpen={isActivityModalOpen} onClose={() => { setIsActivityModalOpen(false); setInputAmount(''); }} title={selectedActivity?.label || 'Registrar Atividade'}>
          <div className="space-y-6">
          <div className="flex justify-center mb-4"><div className={`p-4 rounded-full bg-slate-800 ${ACTIVITY_CATEGORIES.find(c => c.types.includes(selectedActivity?.category || ''))?.color || 'text-white'}`}>{selectedActivity && getIcon(selectedActivity.icon, "w-12 h-12")}</div></div>
          {selectedActivity?.id === 'gym' ? (
              <div className="space-y-4">
                  <div><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Exercício</label><input list="gym-exercises" value={gymExercise} onChange={e => setGymExercise(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" placeholder="Ex: Supino Reto" /><datalist id="gym-exercises">{uniqueExercises.map(ex => <option key={ex} value={ex} />)}</datalist></div>
                  <div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Carga (Kg)</label><input type="number" value={gymWeight} onChange={e => setGymWeight(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" /></div><div><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Repetições</label><input type="number" value={gymReps} onChange={e => setGymReps(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" /></div></div>
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center"><label className="block text-xs font-bold text-slate-400 uppercase mb-2">Descanso</label><div className="flex items-center justify-center gap-4 mb-3"><button onClick={() => setGymRestTime("01:00")} className="text-xs bg-slate-700 px-2 py-1 rounded">1:00</button><button onClick={() => setGymRestTime("01:30")} className="text-xs bg-slate-700 px-2 py-1 rounded">1:30</button><button onClick={() => setGymRestTime("02:00")} className="text-xs bg-slate-700 px-2 py-1 rounded">2:00</button></div>{restEndTime ? (<div className="text-4xl font-mono font-bold text-blue-400 animate-pulse">{Math.floor(timerTimeLeft / 60)}:{(timerTimeLeft % 60).toString().padStart(2, '0')}</div>) : (<input type="time" value={gymRestTime} onChange={e => setGymRestTime(e.target.value)} className="bg-slate-950 text-white p-2 rounded text-center font-mono w-24 mx-auto block" />)}{restEndTime && (<button onClick={() => { setRestEndTime(null); setTimerTimeLeft(0); }} className="mt-3 text-xs text-red-400 flex items-center justify-center gap-1 mx-auto">{getIcon("X", "w-3 h-3")} Cancelar</button>)}</div>
                  <button onClick={handleLogActivity} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">{getIcon("CheckCircle", "w-5 h-5")} Registrar Série</button>
              </div>
          ) : selectedActivity?.id === 'run' ? (
              <div className="space-y-4">
                  <div><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Distância (Km)</label><input type="number" step="0.01" value={runDistance} onChange={e => setRunDistance(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" /></div>
                  <div><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tempo (MM:SS)</label><input type="text" value={runDuration} onChange={e => { let val = e.target.value.replace(/\D/g, ''); if (val.length > 4) val = val.slice(0, 4); if (val.length > 2) val = val.slice(0, 2) + ':' + val.slice(2); setRunDuration(val); }} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white text-center font-mono" /></div>
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center"><div className="text-center w-full"><span className="block text-xs text-slate-400 uppercase font-bold">Pace</span><span className={`text-2xl font-mono font-bold ${Number(currentPace.split(':')[0]) < 4 ? 'text-yellow-400' : 'text-blue-400'}`}>{currentPace} <span className="text-xs text-slate-500">/km</span></span></div></div>
                  <button onClick={handleLogActivity} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">{getIcon("CheckCircle", "w-5 h-5")} Registrar Corrida</button>
              </div>
          ) : selectedActivity?.id === 'shooting' || selectedActivity?.id === 'archery' || selectedActivity?.id === 'knife_throw' ? (
              <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tipo</label><select value={targetTool} onChange={e => setTargetTool(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white"><option value="curta">Curta</option><option value="longa">Longa</option><option value="recurvo">Recurvo</option><option value="composto">Composto</option><option value="sem_giro">Sem Giro</option></select></div><div><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Distância (m)</label><input type="number" value={targetDistance} onChange={e => setTargetDistance(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" /></div></div>
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800"><h4 className="text-xs font-bold text-slate-400 uppercase mb-3 text-center">Impactos</h4><div className="space-y-3">{[{ key: 'center', label: 'Mosca', color: 'text-red-500' }, { key: 'c1', label: '9-8', color: 'text-yellow-500' }, { key: 'c2', label: '7-6', color: 'text-blue-500' }, { key: 'c3', label: '5-4', color: 'text-white' }, { key: 'outer', label: 'Borda', color: 'text-slate-500' }].map(z => (<div key={z.key} className="flex justify-between items-center"><span className={`text-sm font-bold ${z.color}`}>{z.label}</span><div className="flex gap-3"><button onClick={() => setTargetHits(p => ({ ...p, [z.key]: Math.max(0, p[z.key as keyof typeof targetHits] - 1) }))} className="w-8 h-8 rounded bg-slate-800">-</button><span className="w-6 text-center">{targetHits[z.key as keyof typeof targetHits]}</span><button onClick={() => setTargetHits(p => ({ ...p, [z.key]: p[z.key as keyof typeof targetHits] + 1 }))} className="w-8 h-8 rounded bg-slate-800">+</button></div></div>))}</div></div>
                  <button onClick={handleLogActivity} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">{getIcon("CheckCircle", "w-5 h-5")} Registrar</button>
              </div>
          ) : (
              <div className="space-y-4"><div><label className="block text-xs font-bold text-slate-400 uppercase mb-2">Quantidade ({selectedActivity?.unit})</label><input type="number" value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-4 text-white text-2xl font-bold text-center" autoFocus /></div><button onClick={handleLogActivity} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">{getIcon("CheckCircle", "w-5 h-5")} Confirmar</button></div>
          )}
          </div>
      </Modal>
      <Modal isOpen={isSleepModalOpen} onClose={() => setIsSleepModalOpen(false)} title="Registrar Sono">
          <div className="space-y-6"><div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Dormiu</label><input type="time" value={bedTime} onChange={e => setBedTime(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white text-center" /></div><div><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Acordou</label><input type="time" value={wakeTime} onChange={e => setWakeTime(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white text-center" /></div></div><button onClick={handleRegisterSleep} className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">{getIcon("Moon", "w-5 h-5")} Registrar</button></div>
      </Modal>
      <Modal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} title="Ficha do Personagem" large>
          {isEditingProfile ? (<form onSubmit={handleUpdateProfile} className="space-y-4"><div className="grid grid-cols-2 gap-4"><input name="weight" type="number" step="0.1" defaultValue={user!.weight} className="bg-slate-950 border border-slate-700 rounded p-2" /><input name="height" type="number" defaultValue={user!.height} className="bg-slate-950 border border-slate-700 rounded p-2" /></div><div className="flex gap-2"><button type="button" onClick={() => setIsEditingProfile(false)} className="flex-1 bg-slate-700 p-3 rounded">Cancelar</button><button type="submit" className="flex-1 bg-green-600 p-3 rounded">Salvar</button></div></form>) : (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-6 items-center md:items-start"><div className="relative"><div className="w-32 h-32 rounded-full overflow-hidden border-4 border-slate-700 bg-slate-800"><img src={getAvatarUrl} className="w-full h-full object-cover" /></div><button onClick={() => setIsEditingProfile(true)} className="absolute bottom-0 right-0 bg-slate-700 p-2 rounded-full border border-slate-600">{getIcon("Pencil", "w-4 h-4")}</button></div><div className="flex-1 text-center md:text-left"><h2 className="text-3xl font-black text-white">{user!.name}</h2><p className="text-blue-400 font-bold uppercase text-sm">{gameState.classTitle} • Lvl {gameState.level}</p></div></div>
              <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800"><RadarChart attributes={gameState.attributes} /></div>
              
              {/* Daily Summary */}
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-4">
                      <button onClick={() => changeSummaryDate(-1)} className="p-1 hover:bg-slate-800 rounded">{getIcon("ChevronLeft")}</button>
                      <div className="flex items-center gap-2 text-sm font-bold">{getIcon("Calendar", "w-4 h-4 text-blue-400")} <span>{summaryDate.toLocaleDateString()}</span></div>
                      <button onClick={() => changeSummaryDate(1)} className="p-1 hover:bg-slate-800 rounded">{getIcon("ChevronRight")}</button>
                  </div>
                  {dailySummary.count > 0 ? (
                      <div className="space-y-2">
                          <div className="text-right text-xs text-yellow-500 font-bold mb-2">Total do Dia: {dailySummary.totalXp} XP</div>
                          {dailySummary.list.map((item, idx) => (
                              <div key={idx} className="bg-slate-800/50 p-2 rounded flex justify-between items-center text-xs">
                                  <div className="flex items-center gap-2">
                                      {getIcon(item.activity.icon, "w-4 h-4 text-slate-400")}
                                      <span>{item.activity.label} {item.count > 1 && `(x${item.count})`}</span>
                                  </div>
                                  <div className="flex flex-col items-end">
                                      <span className="font-bold">{item.totalAmount} {item.activity.unit}</span>
                                      {item.details.length > 0 && <span className="text-[9px] text-slate-500">{item.details[0]}...</span>}
                                  </div>
                              </div>
                          ))}
                      </div>
                  ) : (<div className="text-center text-xs text-slate-500 py-4">Nenhuma atividade registrada neste dia.</div>)}
              </div>

              {/* General History */}
              <div className="mt-6">
                  <h3 className="text-sm font-bold text-slate-400 uppercase mb-3">Histórico Geral</h3>
                  <div className="space-y-2">
                      {historyGroups.map(([actId, logs]) => {
                          const act = ACTIVITIES.find(a => a.id === actId);
                          if (!act) return null;
                          const isExpanded = expandedHistoryId === actId;
                          return (
                            <div key={actId} className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                                <button onClick={() => setExpandedHistoryId(isExpanded ? null : actId)} className="w-full flex items-center justify-between p-3 bg-slate-800 hover:bg-slate-750 transition-colors">
                                    <div className="flex items-center gap-2"><div className="text-slate-400">{getIcon(act.icon, "w-5 h-5")}</div><span className="font-bold text-sm">{act.label}</span></div>
                                    <div className="flex items-center gap-2"><span className="text-xs bg-slate-900 px-2 py-1 rounded text-slate-300">{logs.length} registros</span>{getIcon(isExpanded ? "ChevronRight" : "ChevronLeft", `w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`)}</div>
                                </button>
                                {isExpanded && (
                                    <div className="p-2 space-y-2 bg-slate-900/50">
                                        {logs.map((log, index) => {
                                            const prevLog = logs[index + 1];
                                            const showDateHeader = !prevLog || getDayLabel(log.timestamp) !== getDayLabel(prevLog.timestamp);
                                            return (
                                                <React.Fragment key={log.id}>
                                                    {showDateHeader && <div className="text-[10px] font-bold text-slate-500 uppercase mt-2 mb-1 pl-2">{getDayLabel(log.timestamp)}</div>}
                                                    <div className="flex justify-between items-center p-2 rounded hover:bg-slate-800/50 text-xs">
                                                        <div>
                                                            <span className="font-bold text-white">{log.amount} {act.unit}</span>
                                                            <div className="text-[10px] text-slate-400">
                                                                {log.details ? (
                                                                    <>
                                                                    {log.details.exercise && <span>{log.details.exercise} • {log.details.weight}kg </span>}
                                                                    {log.details.distance && <span>{log.details.distance}km • {log.details.pace} </span>}
                                                                    {log.details.weapon && <span>{log.details.weapon} • {log.details.distance}m </span>}
                                                                    </>
                                                                ) : (<span>+ {log.xpGained} XP</span>)}
                                                            </div>
                                                        </div>
                                                        <button onClick={() => handleDeleteLog(log.id)} className="text-slate-600 hover:text-red-500 p-1">{getIcon("Trash", "w-3 h-3")}</button>
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
      <Modal isOpen={isQuestModalOpen} onClose={() => setIsQuestModalOpen(false)} title="Missões">
          <div className="space-y-6">
              <div>
                  <h3 className="text-sm font-bold text-slate-400 uppercase mb-3 border-b border-slate-700 pb-1">Diárias</h3>
                  {dailyQuests.length > 0 ? dailyQuests.map(q => {
                      const act = ACTIVITIES.find(a => a.id === q.activityId);
                      if (!act) return null;
                      return (
                          <div key={q.id} className={`p-3 rounded mb-2 border flex justify-between items-center ${q.isClaimed ? 'bg-green-900/20 border-green-800 opacity-50' : 'bg-slate-800 border-slate-700'}`}>
                              <div className="flex items-center gap-3">
                                  <div className="text-slate-400">{getIcon(act.icon, "w-5 h-5")}</div>
                                  <div><div className="text-xs font-bold">{act.label}</div><div className="text-[10px] text-slate-400">{q.currentAmount} / {q.targetAmount} {act.unit}</div></div>
                              </div>
                              {q.isClaimed ? <span className="text-xs text-green-500 font-bold">Completo</span> : q.currentAmount >= q.targetAmount ? <button onClick={() => handleClaimQuest(q.id)} className="bg-yellow-600 text-white text-[10px] font-bold px-2 py-1 rounded animate-pulse">Resgatar {q.xpReward} XP</button> : <span className="text-xs text-slate-500">{Math.floor((q.currentAmount/q.targetAmount)*100)}%</span>}
                          </div>
                      );
                  }) : <div className="text-xs text-slate-500">Nenhuma missão diária disponível.</div>}
              </div>
              <div>
                  <h3 className="text-sm font-bold text-yellow-500/80 uppercase mb-3 border-b border-slate-700 pb-1">Semanais (7x Diária)</h3>
                  {weeklyQuests.length > 0 ? weeklyQuests.map(q => {
                      const act = ACTIVITIES.find(a => a.id === q.activityId);
                      if (!act) return null;
                      return (
                          <div key={q.id} className={`p-3 rounded mb-2 border flex justify-between items-center ${q.isClaimed ? 'bg-green-900/20 border-green-800 opacity-50' : 'bg-slate-800 border-slate-700'}`}>
                              <div className="flex items-center gap-3">
                                  <div className="text-slate-400">{getIcon(act.icon, "w-5 h-5")}</div>
                                  <div><div className="text-xs font-bold">{act.label}</div><div className="text-[10px] text-slate-400">{q.currentAmount} / {q.targetAmount} {act.unit}</div></div>
                              </div>
                              {q.isClaimed ? <span className="text-xs text-green-500 font-bold">Completo</span> : q.currentAmount >= q.targetAmount ? <button onClick={() => handleClaimQuest(q.id)} className="bg-yellow-600 text-white text-[10px] font-bold px-2 py-1 rounded animate-pulse">Resgatar {q.xpReward} XP</button> : <span className="text-xs text-slate-500">{Math.floor((q.currentAmount/q.targetAmount)*100)}%</span>}
                          </div>
                      );
                  }) : <div className="text-xs text-slate-500">Nenhuma missão semanal disponível.</div>}
              </div>
          </div>
      </Modal>
      <Modal isOpen={isGuildModalOpen} onClose={() => setIsGuildModalOpen(false)} title="Clã" large>
           {!currentGuild ? (<div><input value={guildInputId} onChange={e=>setGuildInputId(e.target.value)} className="bg-slate-950 border border-slate-700 rounded p-2" /><button onClick={handleJoinGuild} className="bg-blue-600 px-4 py-2 rounded ml-2">Entrar</button><div className="mt-4 pt-4 border-t border-slate-700"><h3 className="text-sm font-bold mb-2">Criar Guilda</h3><input value={guildCreateName} onChange={e=>setGuildCreateName(e.target.value)} className="bg-slate-950 border border-slate-700 rounded p-2 w-full mb-2" placeholder="Nome da Guilda" /><button onClick={handleCreateGuild} className="bg-green-600 w-full py-2 rounded font-bold">Criar</button></div></div>) : (
             <div className="h-[500px] flex flex-col">
                 <div className="flex border-b border-slate-700 mb-4"><button onClick={()=>setGuildTab('info')} className={`flex-1 py-2 text-xs font-bold uppercase ${guildTab==='info'?'text-blue-400 border-b-2 border-blue-400':'text-slate-500'}`}>Geral</button><button onClick={()=>setGuildTab('chat')} className={`flex-1 py-2 text-xs font-bold uppercase ${guildTab==='chat'?'text-blue-400 border-b-2 border-blue-400':'text-slate-500'}`}>Chat</button><button onClick={()=>setGuildTab('raid')} className={`flex-1 py-2 text-xs font-bold uppercase ${guildTab==='raid'?'text-red-400 border-b-2 border-red-400':'text-slate-500'}`}>Raid (Boss)</button></div>
                 <div className="flex-1 overflow-y-auto">
                     {guildTab === 'info' && (
                         <div className="space-y-4">
                             <div className="text-center"><h2 className="text-2xl font-black text-white">{currentGuild.name}</h2><p className="text-slate-400 text-sm">Nível {currentGuild.level}</p></div>
                             <div className="bg-slate-950 p-4 rounded-xl"><h3 className="text-xs font-bold uppercase text-slate-500 mb-2">Membros ({Object.keys(currentGuild.members).length})</h3>{Object.values(currentGuild.members).map((m: GuildMember) => (<div key={m.uid} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-slate-800 overflow-hidden"><img src={m.avatar || `https://api.dicebear.com/9.x/micah/svg?seed=${m.name.replace(/\s/g, '')}`} className="w-full h-full object-cover"/></div><div><div className="text-sm font-bold">{m.name}</div><div className="text-[10px] text-blue-400">{m.classTitle} • Lvl {m.level}</div></div></div>{m.role === 'leader' && <span className="text-[10px] text-yellow-500 border border-yellow-800 px-1 rounded">Líder</span>}</div>))}</div>
                             <div className="p-4 bg-slate-800 rounded text-center text-xs text-slate-400 select-all">ID: {currentGuild.id}</div>
                         </div>
                     )}
                     {guildTab === 'chat' && (
                         <div className="h-full flex flex-col">
                             <div className="flex-1 overflow-y-auto space-y-3 p-2">
                                 {chatMessages.map(msg => (
                                     <div key={msg.id} className={`flex flex-col ${msg.type === 'system' ? 'items-center' : msg.senderId === currentUser?.uid ? 'items-end' : 'items-start'}`}>
                                         {msg.type === 'system' ? (<span className="text-[10px] bg-slate-800 text-yellow-500 px-2 py-1 rounded-full my-1 border border-yellow-900/30">{msg.text}</span>) : (
                                             <div className={`max-w-[80%] p-2 rounded-lg ${msg.senderId === currentUser?.uid ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 rounded-tl-none'}`}>
                                                 <div className="text-[9px] font-bold opacity-70 mb-0.5">{msg.senderName}</div>
                                                 <div className="text-sm">{msg.text}</div>
                                             </div>
                                         )}
                                     </div>
                                 ))}
                                 <div ref={chatEndRef}></div>
                             </div>
                             <div className="mt-2 flex gap-2"><input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSendMessage()} className="flex-1 bg-slate-950 border border-slate-700 rounded p-2 text-sm" placeholder="Mensagem..." /><button onClick={handleSendMessage} className="bg-blue-600 p-2 rounded text-white">{getIcon("MessageSquare", "w-4 h-4")}</button></div>
                         </div>
                     )}
                     {guildTab === 'raid' && currentGuild.boss && (
                         <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
                             <div className="text-6xl animate-bounce">{currentGuild.boss.image}</div>
                             <div><h2 className="text-xl font-black text-red-500">{currentGuild.boss.name}</h2><p className="text-xs text-red-400 uppercase font-bold">Nível {currentGuild.boss.level}</p></div>
                             <div className="w-full max-w-xs"><div className="flex justify-between text-xs font-bold mb-1"><span>HP</span><span>{currentGuild.boss.currentHp} / {currentGuild.boss.maxHp}</span></div><ProgressBar current={currentGuild.boss.currentHp} max={currentGuild.boss.maxHp} color="bg-red-600" /></div>
                             <button onClick={handleAttackBoss} className="bg-red-600 hover:bg-red-500 text-white text-lg font-black py-4 px-8 rounded-xl shadow-lg shadow-red-900/50 active:scale-95 transition-transform flex items-center gap-2">{getIcon("Swords", "w-6 h-6")} ATACAR</button>
                             <p className="text-xs text-slate-500 max-w-xs">Ataque para reduzir a vida do Boss. Derrote-o para subir o nível da Guilda!</p>
                         </div>
                     )}
                 </div>
             </div>
           )}
      </Modal>

      <Modal isOpen={isMapModalOpen} onClose={() => { setIsMapModalOpen(false); setSelectedTerritory(null); }} title="Mapa de Territórios" large>
           <div className="h-[400px] w-full rounded-xl overflow-hidden relative">
               {userLocation ? (
                   <MapContainer center={[userLocation.lat, userLocation.lng]} zoom={15} style={{ height: '100%', width: '100%' }}>
                       <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                       />
                       <RecenterMap lat={userLocation.lat} lng={userLocation.lng} />
                       <Marker position={[userLocation.lat, userLocation.lng]}>
                           <Popup>Você está aqui</Popup>
                       </Marker>
                       {territories.map(t => (
                           <Circle 
                              key={t.id} 
                              center={[t.lat, t.lng]} 
                              radius={t.radius}
                              pathOptions={{ color: t.ownerId === currentUser?.uid ? 'green' : 'red', fillColor: t.ownerId === currentUser?.uid ? 'green' : 'red' }}
                              eventHandlers={{ click: () => setSelectedTerritory(t) }}
                           />
                       ))}
                   </MapContainer>
               ) : (
                   <div className="flex items-center justify-center h-full text-slate-400">Obtendo localização...</div>
               )}
               {selectedTerritory && (
                   <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 p-4 rounded-xl border border-slate-700 z-[1000]">
                       <div className="flex justify-between items-start mb-2">
                           <div>
                               <h3 className="font-bold text-white">{selectedTerritory.name}</h3>
                               <p className="text-xs text-slate-400">Dono: {selectedTerritory.ownerName || "Ninguém"}</p>
                           </div>
                           <button onClick={() => setSelectedTerritory(null)} className="text-slate-400">{getIcon("X", "w-4 h-4")}</button>
                       </div>
                       <div className="flex gap-4 items-center">
                           <div className="text-4xl">{selectedTerritory.activeEnemy.image}</div>
                           <div className="flex-1">
                               <div className="flex justify-between text-xs font-bold mb-1"><span className="text-red-400">{selectedTerritory.activeEnemy.name} (Lvl {selectedTerritory.activeEnemy.level})</span><span>{selectedTerritory.activeEnemy.currentHp}/{selectedTerritory.activeEnemy.maxHp}</span></div>
                               <ProgressBar current={selectedTerritory.activeEnemy.currentHp} max={selectedTerritory.activeEnemy.maxHp} color="bg-red-600" />
                           </div>
                       </div>
                       <div className="mt-4">
                           {userLocation && getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, selectedTerritory.lat, selectedTerritory.lng) * 1000 <= selectedTerritory.radius ? (
                               <button onClick={handleAttackTerritory} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2">{getIcon("Swords", "w-4 h-4")} BATALHAR</button>
                           ) : (
                               <button disabled className="w-full bg-slate-700 text-slate-500 font-bold py-2 rounded-lg cursor-not-allowed">Você está muito longe</button>
                           )}
                       </div>
                   </div>
               )}
           </div>
      </Modal>

      <Modal isOpen={isAdminModalOpen} onClose={() => setIsAdminModalOpen(false)} title="Painel Admin" large>
           <div className="space-y-6">
               <div className="bg-slate-800 p-4 rounded-xl">
                   <h3 className="font-bold text-white mb-4 border-b border-slate-700 pb-2">Criar Território</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                       <input value={newTerritoryName} onChange={e => setNewTerritoryName(e.target.value)} placeholder="Nome do Local" className="bg-slate-950 border border-slate-700 rounded p-2 text-white" />
                       <input type="number" value={newTerritoryRadius} onChange={e => setNewTerritoryRadius(Number(e.target.value))} placeholder="Raio (metros)" className="bg-slate-950 border border-slate-700 rounded p-2 text-white" />
                       <input value={newEnemyName} onChange={e => setNewEnemyName(e.target.value)} placeholder="Nome do Inimigo" className="bg-slate-950 border border-slate-700 rounded p-2 text-white" />
                       <input type="number" value={newEnemyHp} onChange={e => setNewEnemyHp(Number(e.target.value))} placeholder="HP Inimigo" className="bg-slate-950 border border-slate-700 rounded p-2 text-white" />
                   </div>
                   <div className="flex justify-between items-center mb-4 text-xs text-slate-400 bg-slate-900 p-2 rounded">
                       <span>Localização Atual:</span>
                       <span>{userLocation ? `${userLocation.lat.toFixed(5)}, ${userLocation.lng.toFixed(5)}` : "Desconhecida"}</span>
                   </div>
                   <button onClick={handleCreateTerritory} disabled={!userLocation} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2 rounded-lg">CRIAR AQUI</button>
               </div>
               
               <div className="bg-slate-800 p-4 rounded-xl">
                   <h3 className="font-bold text-white mb-4 border-b border-slate-700 pb-2">Gerenciar Jogadores</h3>
                   <div className="max-h-60 overflow-y-auto space-y-2">
                       {userList.map(u => (
                           <div key={u.uid} className="flex justify-between items-center bg-slate-900 p-2 rounded">
                               <div>
                                   <div className="font-bold text-sm">{u.name}</div>
                                   <div className="text-[10px] text-slate-500">{u.uid}</div>
                               </div>
                               <button onClick={() => banUser(u.uid)} className="text-xs bg-red-900 text-red-200 px-2 py-1 rounded hover:bg-red-700">{getIcon("Ban", "w-3 h-3")}</button>
                           </div>
                       ))}
                   </div>
               </div>
           </div>
      </Modal>

    </div>
  );
}