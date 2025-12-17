
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { UserProfile, GameState, ActivityLog, ACTIVITIES, ActivityType, Gender, Attribute, ATTRIBUTE_LABELS, Quest, BASIC_ACTIVITY_IDS, Guild, ChatMessage, GuildMember, RPG_CLASSES, PublicProfile, Duel, Territory, TerritoryPlayerStats } from './types';
import { getIcon } from './components/Icons';
import { generateRpgFlavorText, NarratorTrigger } from './services/geminiService';
import { auth, loginWithGoogle, logoutUser, saveUserDataToCloud, loadUserDataFromCloud, checkRedirectResult, createGuild, joinGuild, sendMessage, subscribeToGuild, attackBoss, registerWithEmail, loginWithEmail, getGlobalRanking, createDuel, fetchActiveDuels, acceptDuel, updateDuelProgress, cancelDuel, createTerritory, deleteTerritory, subscribeToTerritories, attackTerritoryTarget, banUser, isFirebaseReady, addEnemyToTerritory, getUserTerritoryStats, subscribeToAuth } from './firebase';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet';
import * as L from 'leaflet';

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  var R = 6371; var dLat = deg2rad(lat2-lat1); var dLon = deg2rad(lon2-lon1); 
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); return R * c;
}
function deg2rad(deg: number) { return deg * (Math.PI/180) }

const ProgressBar = ({ current, max, color = "bg-blue-500" }: { current: number; max: number; color?: string }) => {
  const percentage = Math.min(100, Math.max(0, (current / max) * 100));
  return (
    <div className="w-full bg-slate-950 rounded-full h-4 overflow-hidden border border-slate-800 shadow-inner">
      <div className={`h-full ${color} transition-all duration-1000 ease-out flex items-center justify-end pr-1`} style={{ width: `${percentage}%` }}><div className="w-full h-full bg-white/20 animate-pulse"></div></div>
    </div>
  );
};

const Modal = ({ isOpen, onClose, title, children, large = false }: { isOpen: boolean; onClose: () => void; title: string; children?: React.ReactNode; large?: boolean }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-slate-900 border border-slate-700 rounded-xl w-full ${large ? 'max-w-2xl' : 'max-w-md'} shadow-2xl overflow-hidden animate-fade-in-up max-h-[90vh] overflow-y-auto overscroll-contain`}>
        <div className="bg-slate-800 p-4 flex justify-between items-center border-b border-slate-700 sticky top-0 z-10"><h3 className="text-xl font-bold text-white">{title}</h3><button onClick={onClose} className="text-slate-400 hover:text-white p-1">✕</button></div><div className="p-4">{children}</div>
      </div>
    </div>
  );
};

const RadarChart = ({ attributes }: { attributes: Record<Attribute, number> }) => {
  const size = 300; const center = size / 2; const radius = (size / 2) - 40;
  const attributeKeys: Attribute[] = ['STR', 'AGI', 'DEX', 'DRV', 'INT', 'CHA', 'VIG', 'END'];
  const values = attributeKeys.map(k => attributes[k] || 0); const maxVal = Math.max(20, ...values); 
  const getCoordinates = (index: number, value: number) => { const angle = (Math.PI * 2 * index) / attributeKeys.length - Math.PI / 2; const r = (value / maxVal) * radius; return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) }; };
  const points = attributeKeys.map((key, i) => { const { x, y } = getCoordinates(i, attributes[key] || 0); return `${x},${y}`; }).join(" ");
  const backgroundPoints = attributeKeys.map((_, i) => { const { x, y } = getCoordinates(i, maxVal); return `${x},${y}`; }).join(" ");
  return (
    <div className="relative flex justify-center py-4">
      <svg width={size} height={size} className="overflow-visible">
        <polygon points={backgroundPoints} fill="rgba(30, 41, 59, 0.5)" stroke="#334155" strokeWidth="1" />
        {[0.25, 0.5, 0.75].map((scale) => ( <polygon key={scale} points={attributeKeys.map((_, i) => { const { x, y } = getCoordinates(i, maxVal * scale); return `${x},${y}`; }).join(" ")} fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="4 4" /> ))}
        <polygon points={points} fill="rgba(16, 185, 129, 0.4)" stroke="#10b981" strokeWidth="2" />
        {attributeKeys.map((key, i) => { const { x, y } = getCoordinates(i, attributes[key] || 0); return <circle key={i} cx={x} cy={y} r="3" fill="#34d399" />; })}
        {attributeKeys.map((key, i) => { const { x, y } = getCoordinates(i, maxVal + (maxVal * 0.18)); const val = attributes[key] || 0; return ( <g key={i}> <text x={x} y={y - 5} textAnchor="middle" dominantBaseline="middle" className="text-[10px] fill-slate-300 font-bold uppercase" style={{ fontSize: '10px' }}>{ATTRIBUTE_LABELS[key]}</text> <text x={x} y={y + 8} textAnchor="middle" dominantBaseline="middle" className="text-[9px] fill-emerald-400 font-bold">{Math.floor(val)}</text> </g> ); })}
      </svg>
    </div>
  );
};

const ACTIVITY_CATEGORIES = [ { id: 'common', label: 'Atividades Comuns', types: ['health'], color: 'text-yellow-400', icon: 'Star' }, { id: 'physical', label: 'Treino Físico', types: ['fitness'], color: 'text-blue-400', icon: 'Dumbbell' }, { id: 'combat', label: 'Treino Combate', types: ['combat'], color: 'text-red-400', icon: 'Swords' }, { id: 'intellect', label: 'Atividades Intelectuais', types: ['intellect'], color: 'text-purple-400', icon: 'Brain' }, { id: 'social', label: 'Bom-feitor', types: ['social'], color: 'text-emerald-400', icon: 'Heart' }, { id: 'bad_habit', label: 'Hábitos Nocivos', types: ['bad_habit'], color: 'text-slate-400', icon: 'TriangleAlert' } ];
const ATROPHY_THRESHOLDS: Record<Attribute, number> = { STR: 14, VIG: 14, INT: 14, AGI: 18, END: 21, DEX: 25, CHA: 21, DRV: 30 };
const RecenterMap = ({ lat, lng }: { lat: number, lng: number }) => { const map = useMap(); useEffect(() => { map.setView([lat, lng]); }, [lat, lng]); return null; }
const LocationSelector = ({ onSelect }: { onSelect: (lat: number, lng: number) => void }) => { useMapEvents({ click(e) { onSelect(e.latlng.lat, e.latlng.lng); }, }); return null; }

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [gameState, setGameState] = useState<GameState>({ level: 1, currentXp: 0, totalXp: 0, logs: [], classTitle: "NPC", attributes: { STR: 0, END: 0, VIG: 0, AGI: 0, DEX: 0, INT: 0, CHA: 0, DRV: 0 }, activeBuff: null, quests: [] });
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
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [summaryDate, setSummaryDate] = useState(new Date());

  const [selectedActivity, setSelectedActivity] = useState<ActivityType | null>(null);
  const [inputAmount, setInputAmount] = useState('');
  const [gymExercise, setGymExercise] = useState('');
  const [showGymSuggestions, setShowGymSuggestions] = useState(false); 
  const [gymWeight, setGymWeight] = useState('');
  const [gymReps, setGymReps] = useState('');
  const [gymRestTime, setGymRestTime] = useState('02:00');
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
  const [currentUser, setCurrentUser] = useState<any | null>(null);
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
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null);
  const [userTerritoryStats, setUserTerritoryStats] = useState<TerritoryPlayerStats | null>(null);
  const [userList, setUserList] = useState<PublicProfile[]>([]); 
  
  // Admin Create Territory Inputs
  const [adminSelectedLocation, setAdminSelectedLocation] = useState<{lat: number, lng: number} | null>(null);
  const [newTerritoryName, setNewTerritoryName] = useState('');
  const [newTerritoryRadius, setNewTerritoryRadius] = useState(100);
  // Admin Add Enemy Inputs
  const [selectedAdminTerritoryId, setSelectedAdminTerritoryId] = useState('');
  const [newEnemyName, setNewEnemyName] = useState('');
  const [newEnemyActivityId, setNewEnemyActivityId] = useState('pushup');
  const [newEnemyTarget, setNewEnemyTarget] = useState(10);
  const [newEnemyXp, setNewEnemyXp] = useState(100);

  // Battle Mode State
  const [territoryBattleEnemyId, setTerritoryBattleEnemyId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const hasNarratorRunRef = useRef(false);
  const registerFormRef = useRef<HTMLFormElement>(null);

  const XP_FOR_NEXT_LEVEL_BASE = 100;
  const uniqueExercises = useMemo(() => { const exercises = new Set<string>(); gameState.logs.forEach(log => { if (log.activityId === 'gym' && log.details?.exercise) exercises.add(log.details.exercise); }); return Array.from(exercises).sort(); }, [gameState.logs]);
  const filteredExercises = useMemo(() => { if (!gymExercise) return uniqueExercises; return uniqueExercises.filter(ex => ex.toLowerCase().includes(gymExercise.toLowerCase())); }, [uniqueExercises, gymExercise]);
  const historyGroups = useMemo(() => { const groups: Record<string, ActivityLog[]> = {}; gameState.logs.forEach(log => { if (!groups[log.activityId]) groups[log.activityId] = []; groups[log.activityId].push(log); }); return Object.entries(groups).sort(([, aLogs], [, bLogs]) => bLogs[0].timestamp - aLogs[0].timestamp); }, [gameState.logs]);
  const dailySummary = useMemo(() => { const targetDate = summaryDate.toDateString(); const logsForDay = gameState.logs.filter(log => new Date(log.timestamp).toDateString() === targetDate); const totalXp = logsForDay.reduce((acc, log) => acc + log.xpGained, 0); const summaryList: { activity: ActivityType, count: number, totalAmount: number, details: string[] }[] = []; logsForDay.forEach(log => { const act = ACTIVITIES.find(a => a.id === log.activityId); if (!act) return; const existing = summaryList.find(s => s.activity.id === act.id); let detailStr = ""; if (log.details?.exercise) detailStr = `${log.details.exercise} (${log.details.weight}kg)`; else if (log.details?.distance) detailStr = `${log.details.distance}km`; else if (log.details?.weapon) detailStr = log.details.weapon; if (existing) { existing.count += 1; existing.totalAmount += log.amount; if (detailStr) existing.details.push(detailStr); } else { summaryList.push({ activity: act, count: 1, totalAmount: log.amount, details: detailStr ? [detailStr] : [] }); } }); return { totalXp, list: summaryList, count: logsForDay.length }; }, [gameState.logs, summaryDate]);
  const changeSummaryDate = (days: number) => { const newDate = new Date(summaryDate); newDate.setDate(newDate.getDate() + days); setSummaryDate(newDate); };

  useEffect(() => { const handleOnline = () => { setIsOnline(true); const needsSync = localStorage.getItem('liferpg_needs_sync') === 'true'; if (needsSync && currentUser && user && gameState) { setNarratorText("Sincronizando dados..."); setIsSyncing(true); saveUserDataToCloud(currentUser.uid, user, gameState).then((success) => { if (success) { localStorage.removeItem('liferpg_needs_sync'); setNarratorText("Sincronizado!"); } setIsSyncing(false); }); } }; const handleOffline = () => { setIsOnline(false); setNarratorText("Modo Offline."); }; window.addEventListener('online', handleOnline); window.addEventListener('offline', handleOffline); return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); }; }, [currentUser, user, gameState]);
  
  // TIMER LOGIC WITH BACKGROUND SUPPORT
  useEffect(() => { 
      if (restEndTime) { 
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
          updateTimer(); 
          timerIntervalRef.current = window.setInterval(updateTimer, 500); 
      } else { 
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); 
          setTimerTimeLeft(0); 
      } 
      return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); }; 
  }, [restEndTime]);

  useEffect(() => { if ('geolocation' in navigator) { const watchId = navigator.geolocation.watchPosition( (pos) => { setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); }, (err) => { let errorMsg = "Erro desconhecido de GPS"; if (err.code === 1) errorMsg = "Permissão de GPS negada"; else if (err.code === 2) errorMsg = "GPS indisponível"; else if (err.code === 3) errorMsg = "Tempo limite do GPS esgotou"; console.warn(`Geolocalização: ${errorMsg}`); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 } ); return () => navigator.geolocation.clearWatch(watchId); } }, []);
  useEffect(() => { if (isFirebaseReady) { const unsubTerritories = subscribeToTerritories((list) => { setTerritories(list); }); return () => unsubTerritories(); } }, []);
  
  // Load stats when opening territory modal
  useEffect(() => {
      if (selectedTerritory && currentUser) {
          getUserTerritoryStats(selectedTerritory.id, currentUser.uid).then(stats => setUserTerritoryStats(stats));
      }
  }, [selectedTerritory, currentUser]);

  const generateNewQuests = (currentQuests: Quest[], currentClass: string, lastDaily?: number, lastWeekly?: number, logs: ActivityLog[] = []): { quests: Quest[], lastDaily: number, lastWeekly: number } => { const now = new Date(); const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); const day = now.getDay(); const diff = now.getDate() - day; const weekStart = new Date(now.setDate(diff)).setHours(0,0,0,0); let newQuests = [...currentQuests]; let newLastDaily = lastDaily || 0; let newLastWeekly = lastWeekly || 0; const getTarget = (act: ActivityType, type: 'daily' | 'weekly') => { let dailyBase = 1; if (act.unit === 'km') dailyBase = 3; if (act.unit === 'reps') dailyBase = 20; if (act.unit === 'min') dailyBase = 20; if (act.unit === 'copos') dailyBase = 6; if (act.unit === 'pág/min') dailyBase = 15; if (act.unit === 'sessão') dailyBase = 1; if (act.unit === 'ação') dailyBase = 1; if (act.id === 'drive') dailyBase = 20; if (act.id === 'gym') dailyBase = 3; if (type === 'weekly') return dailyBase * 7; return dailyBase; }; const fixedActivityIds = ['water', 'pushup', 'abs']; const logCounts: Record<string, number> = {}; logs.forEach(l => { logCounts[l.activityId] = (logCounts[l.activityId] || 0) + 1; }); const sortedActivities = Object.entries(logCounts).sort((a,b) => b[1] - a[1]); let mostPracticedId: string | null = null; for (const [id] of sortedActivities) { if (!fixedActivityIds.includes(id) && id !== 'sleep') { const act = ACTIVITIES.find(a => a.id === id); if (act && !act.category.includes('bad')) { mostPracticedId = id; break; } } } if (!mostPracticedId) { if (currentClass.includes('Mago')) mostPracticedId = 'study'; else if (currentClass.includes('Corredor')) mostPracticedId = 'run'; else mostPracticedId = 'run'; } const dailyActivityList = [...fixedActivityIds, mostPracticedId].filter(Boolean); if (!lastDaily || lastDaily < todayStart) { newQuests = newQuests.filter(q => q.type !== 'daily'); dailyActivityList.forEach(id => { const act = ACTIVITIES.find(a => a.id === id); if (act) { const target = getTarget(act, 'daily'); newQuests.push({ id: `daily-${Date.now()}-${act.id}`, type: 'daily', activityId: act.id, targetAmount: target, currentAmount: 0, xpReward: Math.floor(target * act.xpPerUnit * 1.2), isClaimed: false, createdAt: Date.now() }); } }); newLastDaily = Date.now(); } if (!lastWeekly || lastWeekly < weekStart) { newQuests = newQuests.filter(q => q.type !== 'weekly'); dailyActivityList.forEach(id => { const act = ACTIVITIES.find(a => a.id === id); if (act) { const target = getTarget(act, 'weekly'); newQuests.push({ id: `weekly-${Date.now()}-${act.id}`, type: 'weekly', activityId: act.id, targetAmount: target, currentAmount: 0, xpReward: Math.floor(target * act.xpPerUnit * 2.0), isClaimed: false, createdAt: Date.now() }); } }); newLastWeekly = Date.now(); } return { quests: newQuests, lastDaily: newLastDaily, lastWeekly: newLastWeekly }; };
  const calculateBmiBonus = (weight: number, height: number): number => { if (weight <= 0 || height <= 0) return 0; const heightM = height / 100; const bmi = weight / (heightM * heightM); if (bmi > 40.0) return 20; if (bmi >= 30.0) return 15; if (bmi >= 25.0) return 10; if (bmi >= 23.41) return 5; return 0; };
  const applyAtrophySystem = (state: GameState): { newState: GameState, lostAttributes: string[] } => { const now = Date.now(); const lastCheck = state.lastAtrophyCheck || 0; const ONE_DAY_MS = 24 * 60 * 60 * 1000; if (now - lastCheck < ONE_DAY_MS) return { newState: state, lostAttributes: [] }; const newAttributes = { ...state.attributes }; const lostAttrs: string[] = []; const lastTrained: Record<string, number> = {}; const attributeKeys = Object.keys(newAttributes) as Attribute[]; attributeKeys.forEach(attr => lastTrained[attr] = 0); for (const log of state.logs) { const act = ACTIVITIES.find(a => a.id === log.activityId); if (act) { if (act.primaryAttribute && log.timestamp > (lastTrained[act.primaryAttribute] || 0)) lastTrained[act.primaryAttribute] = log.timestamp; if (act.secondaryAttribute && log.timestamp > (lastTrained[act.secondaryAttribute] || 0)) lastTrained[act.secondaryAttribute] = log.timestamp; } } attributeKeys.forEach(attr => { const lastTime = lastTrained[attr]; const effectiveLastTime = lastTime === 0 ? now : lastTime; const daysSince = (now - effectiveLastTime) / ONE_DAY_MS; const threshold = ATROPHY_THRESHOLDS[attr]; if (daysSince > threshold) { if (newAttributes[attr] > 0) { newAttributes[attr] = Math.max(0, newAttributes[attr] - 1); lostAttrs.push(attr); } } }); return { newState: { ...state, attributes: newAttributes, lastAtrophyCheck: now }, lostAttributes: lostAttrs }; };
  const getDayLabel = (timestamp: number) => { const date = new Date(timestamp); const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime(); const check = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); if (check === today) return "Hoje"; if (check === yesterday) return "Ontem"; return date.toLocaleDateString(); };
  const createInitialGameState = (bmiBonus: number): GameState => { const { quests, lastDaily, lastWeekly } = generateNewQuests([], "NPC", 0, 0, []); const initialAttributes = { STR: 0, END: 0, VIG: 0, AGI: 0, DEX: 0, INT: 0, CHA: 0, DRV: 0 }; if (bmiBonus > 0) initialAttributes.END = bmiBonus; return { level: 1, currentXp: 0, totalXp: 0, logs: [], classTitle: "NPC", attributes: initialAttributes, activeBuff: null, quests, lastDailyQuestGen: lastDaily, lastWeeklyQuestGen: lastWeekly }; };
  
  const handleGoogleRegister = async () => { if (!registerFormRef.current) return; const formData = new FormData(registerFormRef.current); const name = formData.get('name') as string; const weight = Number(formData.get('weight')); const height = Number(formData.get('height')); if (!name || !weight || !height) { alert("Por favor, preencha Nome, Peso e Altura antes de conectar com Google."); return; } const pendingData = { name, gender: formData.get('gender'), dob: formData.get('dob'), profession: formData.get('profession'), weight, height }; localStorage.setItem('liferpg_pending_reg', JSON.stringify(pendingData)); try { await loginWithGoogle(); } catch(e: any) { alert("Erro Google: " + e.message); } };
  useEffect(() => { const savedUser = localStorage.getItem('liferpg_user'); const savedGame = localStorage.getItem('liferpg_game'); const needsSync = localStorage.getItem('liferpg_needs_sync') === 'true'; if (savedUser) setUser(JSON.parse(savedUser)); if (savedGame) { const parsedGame = JSON.parse(savedGame); const safeAttributes = { STR: 0, END: 0, VIG: 0, AGI: 0, DEX: 0, INT: 0, CHA: 0, DRV: 0, ...parsedGame.attributes }; const currentClass = parsedGame.classTitle || "NPC"; const initialQuests = parsedGame.quests || []; const initialLogs = parsedGame.logs || []; const { quests, lastDaily, lastWeekly } = generateNewQuests(initialQuests, currentClass, parsedGame.lastDailyQuestGen, parsedGame.lastWeeklyQuestGen, initialLogs); let loadedState: GameState = { ...parsedGame, classTitle: currentClass, attributes: safeAttributes, quests, lastDailyQuestGen: lastDaily, lastWeeklyQuestGen: lastWeekly }; const { newState, lostAttributes } = applyAtrophySystem(loadedState); loadedState = newState; if (lostAttributes.length > 0) setNarratorText(`A inatividade cobrou seu preço. Atributos reduzidos: ${lostAttributes.join(', ')}`); setGameState(loadedState); if (parsedGame.guildId && navigator.onLine && isFirebaseReady) { subscribeToGuild(parsedGame.guildId, (guild, messages) => { setCurrentGuild(guild); if (messages) setChatMessages(messages); }); } } else { const { quests, lastDaily, lastWeekly } = generateNewQuests([], "NPC", 0, 0, []); setGameState(prev => ({ ...prev, quests, lastDailyQuestGen: lastDaily, lastWeeklyQuestGen: lastWeekly })); } const checkLogin = async () => { try { const resultUser = await checkRedirectResult(); if (resultUser) { const pendingReg = localStorage.getItem('liferpg_pending_reg'); if (pendingReg) { const regData = JSON.parse(pendingReg); const newUser: UserProfile = { ...regData }; const bmiBonus = calculateBmiBonus(newUser.weight, newUser.height); const newGameState = createInitialGameState(bmiBonus); setUser(newUser); setGameState(newGameState); setCurrentUser(resultUser); await saveUserDataToCloud(resultUser.uid, newUser, newGameState); localStorage.removeItem('liferpg_pending_reg'); updateNarrator(newUser, newGameState, undefined, 'login'); } else { setCurrentUser(resultUser); const cloudData = await loadUserDataFromCloud(resultUser.uid); if (!cloudData) { const defaultUser: UserProfile = { name: resultUser.displayName || "Aventureiro", dob: "2000-01-01", weight: 70, height: 170, gender: 'Outros', profession: 'Iniciante', role: 'user' }; const defaultState = createInitialGameState(0); setUser(defaultUser); setGameState(defaultState); await saveUserDataToCloud(resultUser.uid, defaultUser, defaultState); } } setIsSyncing(true); } } catch (error: any) { alert("Erro login: " + error.message); } }; checkLogin(); if (auth && isFirebaseReady) { const unsubscribe = subscribeToAuth(async (firebaseUser) => { setCurrentUser(firebaseUser); if (firebaseUser) { setIsSyncing(true); if (needsSync && savedUser && savedGame) { const success = await saveUserDataToCloud(firebaseUser.uid, JSON.parse(savedUser), JSON.parse(savedGame)); if (success) localStorage.removeItem('liferpg_needs_sync'); setIsSyncing(false); } else { const cloudData = await loadUserDataFromCloud(firebaseUser.uid); if (cloudData) { const u = cloudData.userProfile; setUser(u); const cloudGame = cloudData.gameState; const safeAttributes = { STR: 0, END: 0, VIG: 0, AGI: 0, DEX: 0, INT: 0, CHA: 0, DRV: 0, ...cloudGame.attributes }; const currentClass = cloudGame.classTitle || "NPC"; const { quests, lastDaily, lastWeekly } = generateNewQuests(cloudGame.quests || [], currentClass, cloudGame.lastDailyQuestGen, cloudGame.lastWeeklyQuestGen, cloudGame.logs || []); let newState: GameState = { ...cloudGame, attributes: safeAttributes, quests, lastDailyQuestGen: lastDaily, lastWeeklyQuestGen: lastWeekly }; const { newState: atrophiedState, lostAttributes } = applyAtrophySystem(newState); newState = atrophiedState; if (lostAttributes.length > 0) setNarratorText(`A inatividade cobrou seu preço. -1 em: ${lostAttributes.join(', ')}`); setGameState(newState); if (cloudGame.guildId) { subscribeToGuild(cloudGame.guildId, (guild, messages) => { setCurrentGuild(guild); if (messages) setChatMessages(messages); }); } fetchActiveDuels(firebaseUser.uid, (activeDuels) => { setDuels(activeDuels); }); if (!hasNarratorRunRef.current && lostAttributes.length === 0) { hasNarratorRunRef.current = true; updateNarrator(u, newState, undefined, 'login'); } } else { if (!localStorage.getItem('liferpg_pending_reg') && savedUser && savedGame) { await saveUserDataToCloud(firebaseUser.uid, JSON.parse(savedUser), JSON.parse(savedGame)); } else if (!localStorage.getItem('liferpg_pending_reg')) { const defaultUser: UserProfile = { name: firebaseUser.displayName || "Aventureiro", dob: "2000-01-01", weight: 70, height: 170, gender: 'Outros', profession: 'Iniciante', role: 'user' }; const defaultState = createInitialGameState(0); setUser(defaultUser); setGameState(defaultState); await saveUserDataToCloud(firebaseUser.uid, defaultUser, defaultState); } } setIsSyncing(false); } } }); return () => unsubscribe(); } }, []);
  useEffect(() => { if (user) { localStorage.setItem('liferpg_user', JSON.stringify(user)); if (currentUser && gameState) saveUserDataToCloud(currentUser.uid, user, gameState).then(s => { if(!s) localStorage.setItem('liferpg_needs_sync', 'true'); }); } }, [user]);
  useEffect(() => { if (gameState) { localStorage.setItem('liferpg_game', JSON.stringify(gameState)); if (currentUser && user) saveUserDataToCloud(currentUser.uid, user, gameState).then(s => { if(!s) localStorage.setItem('liferpg_needs_sync', 'true'); }); } }, [gameState]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages, isGuildModalOpen, guildTab]);

  const handleOpenAdmin = async () => { setIsAdminModalOpen(true); const list = await getGlobalRanking(); setUserList(list); if (userLocation) { setAdminSelectedLocation(userLocation); } };
  const handleGoogleLogin = async () => { if (!isFirebaseReady) { alert("Erro Crítico: O Firebase não foi configurado. As chaves de API estão faltando."); return; } try { await loginWithGoogle(); } catch (e: any) { alert("Erro ao iniciar login: " + e.message); } };
  const handleLogin = async (e: React.FormEvent) => { e.preventDefault(); if (!isFirebaseReady) { alert("Erro Crítico: O Firebase não foi configurado. As chaves de API estão faltando."); return; } try { await loginWithEmail(authEmail, authPassword); } catch (e: any) { alert("Erro Login: " + e.message); } };
  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); if (!isFirebaseReady) { alert("Erro Crítico: O Firebase não foi configurado. As chaves de API estão faltando."); return; } if (authPassword !== authConfirmPassword) { alert("As senhas não conferem!"); return; } if (authPassword.length < 6) { alert("A senha é muito fraca (mínimo 6 caracteres)."); return; } const formData = new FormData(e.currentTarget); const name = formData.get('name') as string; const gender = formData.get('gender') as Gender; const dob = formData.get('dob') as string; const profession = formData.get('profession') as string; const weight = Number(formData.get('weight')); const height = Number(formData.get('height')); try { const firebaseUser = await registerWithEmail(authEmail, authPassword); const newUser: UserProfile = { name, dob, weight, height, gender, profession }; const bmiBonus = calculateBmiBonus(weight, height); const newGameState = createInitialGameState(bmiBonus); setUser(newUser); setGameState(newGameState); setCurrentUser(firebaseUser); await saveUserDataToCloud(firebaseUser.uid, newUser, newGameState); updateNarrator(newUser, newGameState, undefined, 'login'); } catch (e: any) { alert("Erro ao criar conta: " + e.message); } };
  const handleLogout = async () => { await logoutUser(); localStorage.removeItem('liferpg_user'); localStorage.removeItem('liferpg_game'); localStorage.removeItem('liferpg_needs_sync'); setUser(null); setCurrentUser(null); setGameState({ level: 1, currentXp: 0, totalXp: 0, logs: [], classTitle: "NPC", attributes: { STR: 0, END: 0, VIG: 0, AGI: 0, DEX: 0, INT: 0, CHA: 0, DRV: 0 }, activeBuff: null, quests: [], guildId: undefined }); setCurrentGuild(null); setChatMessages([]); setAuthView('login'); setNarratorText("Até a próxima jornada."); setIsSideMenuOpen(false); };
  const calculateXpForNextLevel = (level: number) => { return level * XP_FOR_NEXT_LEVEL_BASE; };
  const determineClass = (attrs: Record<Attribute, number>, weight: number, height: number, logs: ActivityLog[]): string => { let maxAttr: Attribute = 'STR'; let maxVal = -1; for (const key of Object.keys(attrs) as Attribute[]) { if (attrs[key] > maxVal) { maxVal = attrs[key]; maxAttr = key; } } if (maxVal < 10) return "NPC"; let secondMaxAttr: Attribute | null = null; let secondMaxVal = -1; for (const key of Object.keys(attrs) as Attribute[]) { if (key !== maxAttr && attrs[key] > secondMaxVal) { secondMaxVal = attrs[key]; secondMaxAttr = key; } } const isSecondaryRelevant = secondMaxAttr && secondMaxVal > (maxVal * 0.4); const heightM = height / 100; const bmi = weight > 0 && height > 0 ? weight / (heightM * heightM) : 22; let combatCount = 0; let fitnessCount = 0; logs.slice(0, 50).forEach(log => { const act = ACTIVITIES.find(a => a.id === log.activityId); if (act?.category === 'combat') combatCount++; if (act?.category === 'fitness') fitnessCount++; }); switch (maxAttr) { case 'STR': if (bmi >= 28 && isSecondaryRelevant && secondMaxAttr === 'END') return "Tanque"; if (bmi >= 28 && !isSecondaryRelevant) return "Tanque"; if (isSecondaryRelevant && secondMaxAttr === 'DEX') return "Lutador"; if (isSecondaryRelevant && secondMaxAttr === 'AGI') return "Berseker"; if (combatCount > fitnessCount) return "Lutador"; if (fitnessCount > combatCount) return "Guerreiro"; return "Guerreiro"; case 'VIG': if (isSecondaryRelevant && secondMaxAttr === 'STR') return "Biker"; if (isSecondaryRelevant && secondMaxAttr === 'AGI') return "Corredor"; return "Corredor"; case 'END': if (isSecondaryRelevant && secondMaxAttr === 'STR') { if (bmi >= 28) return "Tanque"; return "Guerreiro"; } return "Guerreiro"; case 'AGI': if (isSecondaryRelevant && secondMaxAttr === 'DEX') return "Espadachim"; return "Velocista"; case 'DEX': if (isSecondaryRelevant && secondMaxAttr === 'STR') return "Lutador"; if (isSecondaryRelevant && secondMaxAttr === 'AGI') return "Espadachim"; return "Atirador"; case 'INT': return "Mago"; case 'CHA': if (isSecondaryRelevant && secondMaxAttr === 'INT') return "Conselheiro"; return "Healer"; case 'DRV': return "Motorista"; default: return "Aventureiro"; } };

  const handleUpdateProfile = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); if (!user) return; const formData = new FormData(e.currentTarget); const newWeight = Number(formData.get('weight')); const newHeight = Number(formData.get('height')); const oldBonus = calculateBmiBonus(user.weight, user.height); const newBonus = calculateBmiBonus(newWeight, newHeight); const bonusDiff = newBonus - oldBonus; const updatedUser: UserProfile = { ...user, weight: newWeight, height: newHeight, gender: formData.get('gender') as Gender, profession: formData.get('profession') as string, }; if (bonusDiff !== 0) { setGameState(prev => ({ ...prev, attributes: { ...prev.attributes, END: Math.max(0, (prev.attributes.END || 0) + bonusDiff) } })); } const newClassTitle = determineClass(gameState.attributes, newWeight, newHeight, gameState.logs); setUser(updatedUser); setGameState(prev => ({ ...prev, classTitle: newClassTitle })); setIsEditingProfile(false); setNarratorText(`Perfil atualizado! Você parece diferente, ${updatedUser.name}.`); };
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file || !user) return; const reader = new FileReader(); reader.onload = (event) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 300; const ctx = canvas.getContext('2d'); ctx?.drawImage(img, 0, 0, 300, 300); setUser({ ...user, avatarImage: canvas.toDataURL('image/jpeg', 0.8) }); }; img.src = event.target.result as string; }; reader.readAsDataURL(file); };
  const updateNarrator = async (u: UserProfile, g: GameState, activityName?: string, trigger: NarratorTrigger = 'activity') => { if (!isOnline) { if (trigger === 'login') setNarratorText("Bem-vindo ao modo offline."); else setNarratorText("Atividade registrada localmente."); return; } setLoadingAi(true); try { const text = await generateRpgFlavorText(u, g, trigger, activityName); setNarratorText(text); } catch (err) { console.error(err); } finally { setLoadingAi(false); } };
  
  // MANUAL TIMER CONTROLS
  const handleCancelTimer = () => {
      setRestEndTime(null);
      setTimerTimeLeft(0);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
  };
  
  const handleAddTimerTime = () => {
      if (restEndTime) {
          setRestEndTime(restEndTime + 30000);
      }
  };

  const handleLogActivity = async () => {
    if (!selectedActivity || !user) return;

    // Check if timer is running for gym
    if (selectedActivity.id === 'gym' && timerTimeLeft > 0) {
        alert("Aguarde o cronômetro zerar ou cancele o descanso.");
        return;
    }

    let amount = 0; let xpGained = 0; let details: ActivityLog['details'] | undefined = undefined;
    const newAttributes = { ...gameState.attributes };

    // --- TERRITORY BATTLE LOGIC ---
    if (territoryBattleEnemyId && selectedTerritory && currentUser) {
        let battleAmount = 0;
        if (selectedActivity.unit === 'reps' || selectedActivity.unit === 'série') battleAmount = Number(gymReps || inputAmount) || 0;
        else if (selectedActivity.unit === 'km') battleAmount = Number(runDistance || inputAmount) || 0;
        else battleAmount = Number(inputAmount) || 1;

        if (battleAmount <= 0) return;
        
        await attackTerritoryTarget(selectedTerritory.id, territoryBattleEnemyId, battleAmount, currentUser.uid, user.name, user.avatarImage);
        alert(`Desafio registrado! +${battleAmount} ${selectedActivity.unit}`);
        setIsActivityModalOpen(false);
        setTerritoryBattleEnemyId(null);
        setSelectedActivity(null);
        return; 
    }
    
    // ... Standard Log Logic ...
    if (selectedActivity.category === 'bad_habit') { const now = Date.now(); let buffMultiplier = 1; let buffDurationHours = 0; let debuffName = ""; if (selectedActivity.id === 'alcohol') { buffMultiplier = 0.5; buffDurationHours = 12; debuffName = "Ressaca"; } else if (selectedActivity.id === 'smoke') { buffMultiplier = 0.7; buffDurationHours = 4; debuffName = "Fôlego Curto"; } else if (selectedActivity.id === 'junk_food') { buffMultiplier = 0.8; buffDurationHours = 3; debuffName = "Digestão Pesada"; } const expireDate = now + (buffDurationHours * 60 * 60 * 1000); setGameState(prev => ({ ...prev, activeBuff: { multiplier: buffMultiplier, expiresAt: expireDate, description: `${debuffName}: ${Math.round((buffMultiplier - 1) * 100)}% XP` } })); amount = Number(inputAmount) || 1; xpGained = 0; const newLog: ActivityLog = { id: Date.now().toString(), activityId: selectedActivity.id, amount, xpGained, timestamp: Date.now(), details: details }; setGameState(prev => ({ ...prev, logs: [newLog, ...prev.logs].slice(0, 50) })); setIsActivityModalOpen(false); setNarratorText(`Hábito nocivo registrado.`); return; }
    if (selectedActivity.id === 'gym') { const weight = Number(gymWeight) || 0; const reps = Number(gymReps) || 0; if (reps <= 0) return; amount = 1; const effectiveWeight = weight > 0 ? weight : 10; xpGained = Math.floor((effectiveWeight * reps) / 5) + 5; details = { exercise: gymExercise || 'Exercício', weight: weight, reps: reps, restTime: 0 }; const attributePoints = Math.ceil(xpGained / 5); if (reps <= 6) { newAttributes.STR = (newAttributes.STR || 0) + attributePoints; newAttributes.END = (newAttributes.END || 0) + Math.ceil(attributePoints * 0.5); } else if (reps >= 7 && reps <= 9) { newAttributes.STR = (newAttributes.STR || 0) + Math.ceil(attributePoints * 0.7); newAttributes.END = (newAttributes.END || 0) + Math.ceil(attributePoints * 0.7); } else { newAttributes.END = (newAttributes.END || 0) + attributePoints; newAttributes.STR = (newAttributes.STR || 0) + Math.ceil(attributePoints * 0.5); } const [mins, secs] = gymRestTime.split(':').map(Number); const totalSecs = (mins * 60) + secs; if (totalSecs > 0) { const endTime = Date.now() + (totalSecs * 1000); setRestEndTime(endTime); } } else if (selectedActivity.id === 'run') { const distance = Number(runDistance) || 0; if (distance <= 0) return; const [minsStr, secsStr] = runDuration.split(':'); const totalMinutes = (Number(minsStr) || 0) + ((Number(secsStr) || 0) / 60); if (totalMinutes <= 0) return; amount = distance; const pace = totalMinutes / distance; let baseXp = Math.floor(distance * selectedActivity.xpPerUnit); let paceMultiplier = 1; if (pace <= 3.75) paceMultiplier = 1.5; else if (pace <= 4.5) paceMultiplier = 1.2; xpGained = Math.floor(baseXp * paceMultiplier); const paceMins = Math.floor(pace); const paceSecs = Math.round((pace - paceMins) * 60); details = { distance: distance, duration: runDuration, pace: `${paceMins}:${paceSecs.toString().padStart(2, '0')} /km` }; const pointsEarned = Math.ceil(amount * paceMultiplier); newAttributes.VIG = (newAttributes.VIG || 0) + pointsEarned; if (pace <= 4.5) newAttributes.AGI = (newAttributes.AGI || 0) + Math.ceil(pointsEarned * 0.7); else newAttributes.AGI = (newAttributes.AGI || 0) + Math.ceil(pointsEarned * 0.3); } else if (['shooting', 'archery', 'knife_throw'].includes(selectedActivity.id)) { const dist = Number(targetDistance) || 0; const totalShots = targetHits.center + targetHits.c1 + targetHits.c2 + targetHits.c3 + targetHits.outer; if (totalShots <= 0 || dist <= 0) return; const rawScore = (targetHits.center * 10) + (targetHits.c1 * 5) + (targetHits.c2 * 3) + (targetHits.c3 * 2) + (targetHits.outer * 1); let distanceFactor = 1; const tool = targetTool.toLowerCase(); if (selectedActivity.id === 'shooting') { if (tool === 'curta') distanceFactor = 1 + (dist / 10); else if (tool === 'espingarda') distanceFactor = 1 + (dist / 25); else distanceFactor = 1 + (dist / 50); } else if (selectedActivity.id === 'archery') { if (tool === 'composto') distanceFactor = 1 + (dist / 30); else if (tool === 'recurvo') distanceFactor = 1.2 + (dist / 20); else if (tool === 'longbow') distanceFactor = 1.5 + (dist / 20); else if (tool === 'besta') distanceFactor = 1 + (dist / 40); } else if (selectedActivity.id === 'knife_throw') { if (dist <= 3) distanceFactor = 1; else distanceFactor = 1 + (dist / 3); } xpGained = Math.ceil(rawScore * distanceFactor * 0.2); if (selectedActivity.id === 'knife_throw') xpGained = Math.ceil(xpGained * 1.2); amount = 1; details = { weapon: targetTool, distance: dist, hits: { ...targetHits } }; const attrPoints = Math.ceil(xpGained / 3); if (selectedActivity.id === 'shooting') { newAttributes.DEX = (newAttributes.DEX || 0) + attrPoints; if (tool === 'curta' || tool === 'longa') newAttributes.INT = (newAttributes.INT || 0) + Math.ceil(attrPoints * 0.5); else newAttributes.STR = (newAttributes.STR || 0) + Math.ceil(attrPoints * 0.5); } else if (selectedActivity.id === 'archery') { newAttributes.DEX = (newAttributes.DEX || 0) + attrPoints; newAttributes.STR = (newAttributes.STR || 0) + Math.ceil(attrPoints * 0.6); } else if (selectedActivity.id === 'knife_throw') { newAttributes.DEX = (newAttributes.DEX || 0) + attrPoints; newAttributes.AGI = (newAttributes.AGI || 0) + Math.ceil(attrPoints * 0.5); } } else { if (!inputAmount || isNaN(Number(inputAmount))) return; amount = Number(inputAmount); xpGained = Math.floor(amount * selectedActivity.xpPerUnit); let pointsEarned = Math.ceil(amount); if (selectedActivity.id === 'drive') pointsEarned = Math.floor(amount / 50); if (selectedActivity.primaryAttribute) newAttributes[selectedActivity.primaryAttribute] = (newAttributes[selectedActivity.primaryAttribute] || 0) + pointsEarned; if (selectedActivity.secondaryAttribute) newAttributes[selectedActivity.secondaryAttribute] = (newAttributes[selectedActivity.secondaryAttribute] || 0) + Math.ceil(pointsEarned * 0.5); }
    
    let buffApplied = false; if (gameState.activeBuff && Date.now() < gameState.activeBuff.expiresAt) { xpGained = Math.floor(xpGained * gameState.activeBuff.multiplier); buffApplied = true; }
    const newLog: ActivityLog = { id: Date.now().toString(), activityId: selectedActivity.id, amount, xpGained, timestamp: Date.now(), details: details }; let newCurrentXp = gameState.currentXp + xpGained; let newTotalXp = gameState.totalXp + xpGained; let newLevel = gameState.level; let leveledUp = false; let xpNeeded = calculateXpForNextLevel(newLevel); while (newCurrentXp >= xpNeeded) { newCurrentXp -= xpNeeded; newLevel++; xpNeeded = calculateXpForNextLevel(newLevel); leveledUp = true; } const updatedQuests = gameState.quests.map(q => { if (!q.isClaimed && q.activityId === selectedActivity.id) return { ...q, currentAmount: q.currentAmount + amount }; return q; }); const updatedLogs = [newLog, ...gameState.logs].slice(0, 50); const newClassTitle = determineClass(newAttributes, user.weight, user.height, updatedLogs); const activeBuff = (gameState.activeBuff && Date.now() < gameState.activeBuff.expiresAt) ? gameState.activeBuff : null; const newState = { ...gameState, level: newLevel, currentXp: newCurrentXp, totalXp: newTotalXp, logs: updatedLogs, attributes: newAttributes, classTitle: newClassTitle, activeBuff: activeBuff, quests: updatedQuests };
    setGameState(newState); if (currentUser) updateDuelProgress(currentUser.uid, selectedActivity.id, amount);
    if (selectedActivity.id !== 'gym') { setIsActivityModalOpen(false); setInputAmount(''); setRunDistance(''); setRunDuration(''); setTargetDistance(''); setTargetHits({ center: 0, c1: 0, c2: 0, c3: 0, outer: 0 }); setSelectedActivity(null); }
    if (leveledUp) { setShowLevelUp(true); setTimeout(() => setShowLevelUp(false), 5000); updateNarrator(user!, newState, "LEVEL UP", 'level_up'); } else { if (selectedActivity.id !== 'gym') updateNarrator(user!, newState, selectedActivity.label + (buffApplied ? " (Buffado)" : ""), 'activity'); }
  };
  const handleDeleteLog = (logId: string) => { if (!window.confirm("Tem certeza?")) return; const logToDelete = gameState.logs.find(l => l.id === logId); if (!logToDelete || !user) return; let newTotalXp = Math.max(0, gameState.totalXp - logToDelete.xpGained); let newLevel = 1; let xpAccumulator = 0; let xpForNext = calculateXpForNextLevel(1); while (xpAccumulator + xpForNext <= newTotalXp) { xpAccumulator += xpForNext; newLevel++; xpForNext = calculateXpForNextLevel(newLevel); } let newCurrentXp = newTotalXp - xpAccumulator; const newAttributes = { ...gameState.attributes }; const updatedLogs = gameState.logs.filter(l => l.id !== logId); setGameState(prev => ({ ...prev, level: newLevel, currentXp: newCurrentXp, totalXp: newTotalXp, logs: updatedLogs, attributes: newAttributes })); };
  const handleClaimQuest = (questId: string) => { const quest = gameState.quests.find(q => q.id === questId); if (!quest || quest.isClaimed) return; const xpGained = quest.xpReward; let newCurrentXp = gameState.currentXp + xpGained; let newTotalXp = gameState.totalXp + xpGained; let newLevel = gameState.level; let leveledUp = false; let xpNeeded = calculateXpForNextLevel(newLevel); while (newCurrentXp >= xpNeeded) { newCurrentXp -= xpNeeded; newLevel++; xpNeeded = calculateXpForNextLevel(newLevel); leveledUp = true; } const updatedQuests = gameState.quests.map(q => q.id === questId ? { ...q, isClaimed: true } : q); setGameState({ ...gameState, level: newLevel, currentXp: newCurrentXp, totalXp: newTotalXp, quests: updatedQuests }); if (leveledUp) { setShowLevelUp(true); setTimeout(() => setShowLevelUp(false), 5000); } };
  const handleRegisterSleep = () => { const [bedH, bedM] = bedTime.split(':').map(Number); const [wakeH, wakeM] = wakeTime.split(':').map(Number); let sleepDuration = 0; const bedMinutes = bedH * 60 + bedM; const wakeMinutes = wakeH * 60 + wakeM; if (wakeMinutes >= bedMinutes) sleepDuration = (wakeMinutes - bedMinutes) / 60; else sleepDuration = ((1440 - bedMinutes) + wakeMinutes) / 60; let percentage = 0; if (sleepDuration <= 9) percentage = sleepDuration * 2; else { const base = 18; const penalty = (sleepDuration - 9) * 2; percentage = Math.max(0, base - penalty); } const multiplier = 1 + (percentage / 100); const now = new Date(); const expireDate = new Date(); expireDate.setHours(bedH, bedM, 0, 0); if (expireDate.getTime() < now.getTime()) { if (now.getHours() > bedH) expireDate.setDate(expireDate.getDate() + 1); } setGameState(prev => ({ ...prev, quests: prev.quests.map(q => q.activityId === 'sleep' && !q.isClaimed ? { ...q, currentAmount: q.currentAmount + 1 } : q), activeBuff: { multiplier: Number(multiplier.toFixed(2)), expiresAt: expireDate.getTime(), description: `Buff de Sono: +${percentage.toFixed(0)}% XP` } })); setIsSleepModalOpen(false); setNarratorText(`Sono registrado!`); };
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
  const handleCreateTerritory = async () => { const loc = adminSelectedLocation || userLocation; if (!loc) { alert("Nenhuma localização selecionada ou GPS indisponível."); return; } await createTerritory(newTerritoryName, loc.lat, loc.lng, newTerritoryRadius); setNewTerritoryName(''); setIsAdminModalOpen(false); setAdminSelectedLocation(null); alert("Território criado!"); };
  const handleAddEnemyToTerritory = async () => {
      if (!selectedAdminTerritoryId) return;
      const act = ACTIVITIES.find(a => a.id === newEnemyActivityId);
      if (!act) return;
      const enemy: any = {
          id: Date.now().toString(),
          name: newEnemyName,
          image: "👾",
          activityId: newEnemyActivityId,
          baseTarget: Number(newEnemyTarget),
          xpReward: Number(newEnemyXp)
      };
      await addEnemyToTerritory(selectedAdminTerritoryId, enemy);
      alert("Inimigo adicionado!");
  };

  const handleChallengeEnemy = (enemy: any) => {
      // Find activity and open modal
      const act = ACTIVITIES.find(a => a.id === enemy.activityId);
      if (!act) return;
      setTerritoryBattleEnemyId(enemy.id);
      setSelectedActivity(act);
      setIsActivityModalOpen(true);
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

  if (!user) { return ( <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950"> <div className="w-full max-w-md space-y-6"> <div className="text-center"><h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500 mb-2">LifeRPG</h1></div> {!isFirebaseReady && ( <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-xl text-xs"> <strong>ERRO CRÍTICO: Firebase não configurado.</strong> <p className="mt-1">O aplicativo não consegue se conectar ao servidor.</p> <ul className="list-disc pl-4 mt-2 space-y-1"> <li>Se estiver no PC (Localhost): Verifique se o arquivo <code>.env</code> existe na raiz com as chaves corretas.</li> <li>Se estiver na Vercel: Verifique as <code>Environment Variables</code> no painel de Settings.</li> </ul> </div> )} <div className="bg-slate-900/80 p-6 rounded-2xl shadow-xl border border-slate-800 backdrop-blur-sm"> <div className="flex border-b border-slate-700 mb-6"> <button onClick={() => setAuthView('login')} className={`flex-1 pb-2 text-sm font-bold uppercase ${authView === 'login' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}>Já tenho conta</button> <button onClick={() => setAuthView('register')} className={`flex-1 pb-2 text-sm font-bold uppercase ${authView === 'register' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}>Nova Jornada</button> </div> {authView === 'login' ? ( <form onSubmit={handleLogin} className="space-y-4"> <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" placeholder="Email" /> <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" placeholder="Senha" /> <button type="submit" disabled={!isFirebaseReady} className="w-full bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl">Entrar</button> <button type="button" onClick={handleGoogleLogin} disabled={!isFirebaseReady} className="w-full bg-slate-800 disabled:opacity-50 text-white py-3 rounded-xl flex items-center justify-center gap-2">{getIcon("User", "w-4 h-4")} Google</button> </form> ) : ( <form ref={registerFormRef} onSubmit={handleRegister} className="space-y-4"> <input name="name" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2" placeholder="Nome Herói" /> <div className="grid grid-cols-2 gap-2"><select name="gender" className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"><option>Masculino</option><option>Feminino</option><option>Outros</option></select><input type="date" name="dob" className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-white" /></div> <input name="profession" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2" placeholder="Profissão" /> <div className="grid grid-cols-2 gap-2"><input type="number" name="weight" step="0.1" required className="bg-slate-950 border border-slate-700 rounded-lg p-2" placeholder="Peso" /><input type="number" name="height" required className="bg-slate-950 border border-slate-700 rounded-lg p-2" placeholder="Altura" /></div> <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2" placeholder="Email" /> <div className="grid grid-cols-2 gap-2"><input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required className="bg-slate-950 border border-slate-700 rounded-lg p-2" placeholder="Senha" /><input type="password" value={authConfirmPassword} onChange={e => setAuthConfirmPassword(e.target.value)} required className={`bg-slate-950 border rounded-lg p-2 ${authPassword!==authConfirmPassword?'border-red-500':'border-slate-700'}`} placeholder="Confirmar" /></div> <div className="grid grid-cols-2 gap-3 mt-4"> <button type="submit" disabled={!isFirebaseReady} className="w-full bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl text-sm">Iniciar (Email)</button> <button type="button" onClick={handleGoogleRegister} disabled={!isFirebaseReady} className="w-full bg-slate-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm">{getIcon("User", "w-4 h-4")} Google</button> </div> </form> )} </div> </div> </div> ); }

  const ownerIcon = L.divIcon({ className: 'bg-transparent', html: '<div class="w-10 h-10 rounded-full border-2 border-yellow-500 overflow-hidden"><img src="https://api.dicebear.com/9.x/micah/svg?seed=Admin" class="w-full h-full bg-slate-900" /></div>' });
  const getOwnerIcon = (avatar: string) => L.divIcon({ className: 'bg-transparent', html: `<div class="w-12 h-12 rounded-full border-4 border-yellow-500 overflow-hidden shadow-lg shadow-yellow-500/50"><img src="${avatar}" class="w-full h-full bg-slate-900 object-cover" /></div>` });

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24 md:pb-6 relative overflow-hidden">
      {isSideMenuOpen && ( <div className="relative z-50"> <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsSideMenuOpen(false)}></div> <div className="fixed top-0 left-0 h-full w-64 bg-slate-900 border-r border-slate-800 shadow-2xl p-6 flex flex-col animate-fade-in-right"> <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4"> <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">MENU</h2> <button onClick={() => setIsSideMenuOpen(false)} className="text-slate-400 hover:text-white">{getIcon("X")}</button> </div> <div className="space-y-4 flex-1 overflow-y-auto"> <button onClick={() => { setIsSideMenuOpen(false); setIsMapModalOpen(true); }} className="w-full bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-700/50 p-3 rounded-lg flex items-center gap-3 font-bold transition-colors">{getIcon("Map", "w-5 h-5")} <span>MAPA</span></button> <button onClick={() => { setIsSideMenuOpen(false); setIsRankModalOpen(true); }} className="w-full bg-yellow-900/40 hover:bg-yellow-900/60 text-yellow-400 border border-yellow-700/50 p-3 rounded-lg flex items-center gap-3 font-bold transition-colors">{getIcon("Globe", "w-5 h-5")} <span>RANK GLOBAL</span></button> <button onClick={() => { setIsSideMenuOpen(false); setIsGuildModalOpen(true); }} className="w-full bg-indigo-900/40 hover:bg-indigo-900/60 text-indigo-400 border border-indigo-700/50 p-3 rounded-lg flex items-center gap-3 font-bold transition-colors">{getIcon("Shield", "w-5 h-5")} <span>CLÃ</span></button> <button onClick={() => { setIsSideMenuOpen(false); setIsQuestModalOpen(true); }} className="w-full bg-amber-900/40 hover:bg-amber-900/60 text-amber-400 border border-amber-700/50 p-3 rounded-lg flex items-center gap-3 font-bold transition-colors relative"> {getIcon("Scroll", "w-5 h-5")} <span>QUESTS</span> {unclaimedQuestsCount > 0 && <span className="absolute right-3 w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>} </button> {user.role === 'admin' && ( <button onClick={() => { setIsSideMenuOpen(false); handleOpenAdmin(); }} className="w-full bg-red-900/40 hover:bg-red-900/60 text-red-400 border border-red-700/50 p-3 rounded-lg flex items-center gap-3 font-bold transition-colors">{getIcon("ShieldAlert", "w-5 h-5")} <span>ADMIN</span></button> )} </div> <div className="mt-auto pt-4 border-t border-slate-800"> {currentUser && ( <button onClick={handleLogout} className="w-full bg-slate-800 hover:bg-red-900/80 text-slate-300 hover:text-white border border-slate-600 p-3 rounded-lg flex items-center justify-center gap-2 font-bold transition-colors">{getIcon("Ban", "w-5 h-5")} SAIR</button> )} </div> </div> </div> )}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40"> <div className="max-w-2xl mx-auto p-4"> <div className="flex items-center justify-between mb-4"> <div className="flex items-center gap-4 flex-1"> <button onClick={() => setIsSideMenuOpen(true)} className="p-2 bg-slate-800 rounded-lg text-slate-300 hover:text-white border border-slate-700 hover:bg-slate-700 transition-colors"> {getIcon("Menu", "w-6 h-6")} </button> <div className="flex items-center gap-3 cursor-pointer min-w-0" onClick={() => setIsProfileModalOpen(true)}> <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-slate-700 bg-slate-800 relative flex-shrink-0"> <img src={getAvatarUrl} alt="Avatar" className="w-full h-full object-cover" /> {isBuffActive && <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border border-slate-900 ${isDebuff ? 'bg-red-600 animate-pulse' : 'bg-purple-600'}`}></div>} </div> <div className="flex flex-col min-w-0"> <h1 className="font-bold text-sm leading-tight text-white truncate">{user.name}</h1> <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider truncate">{gameState.classTitle}</span> </div> </div> </div> <div className="flex items-center gap-3"> {currentUser && ( isSyncing ? (<div className="p-2 text-blue-400 animate-spin" title="Sincronizando">{getIcon("RefreshCw", "w-5 h-5")}</div>) : isOnline ? (<div className="p-2 text-emerald-400" title="Online & Salvo">{getIcon("Cloud", "w-5 h-5")}</div>) : (<div className="p-2 text-red-400" title="Offline">{getIcon("CloudOff", "w-5 h-5")}</div>) )} {currentUser && ( <button onClick={handleLogout} className="p-2 bg-slate-800 rounded-lg text-red-400 border border-slate-700 hover:bg-red-900/20" title="Sair"> {getIcon("LogOut", "w-5 h-5")} </button> )} </div> </div> <div className="relative pt-1"> <div className="flex mb-2 items-center justify-between"><span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-100 bg-slate-800 border border-slate-700">Lvl {gameState.level} • XP {gameState.currentXp} / {xpNeeded}</span>{isBuffActive && <span className={`text-xs font-bold ${isDebuff ? 'text-red-400' : 'text-purple-400'} animate-pulse flex items-center gap-1`}>{getIcon(isDebuff ? "TriangleAlert" : "Clock", "w-3 h-3")} {buffPercentage}% XP</span>}</div> <ProgressBar current={gameState.currentXp} max={xpNeeded} /> </div> </div> </header>
      <main className="max-w-2xl mx-auto p-4 space-y-6"> <div className="bg-slate-800/40 border border-slate-700 p-4 rounded-xl relative overflow-hidden group"><div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div><div className="flex gap-3"><div className="mt-1 min-w-[24px]">{getIcon("Brain", "w-6 h-6 text-blue-400")}</div><div><p className="text-sm text-slate-100 italic leading-relaxed">"{narratorText}"</p></div></div></div> {duels.length > 0 && (<div className="bg-slate-900 border border-red-900/50 p-4 rounded-xl"><h2 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-2">{getIcon("Swords", "w-4 h-4")} Duelos Ativos</h2><div className="space-y-2">{duels.map(duel => (<div key={duel.id} className="bg-slate-800 p-3 rounded-lg flex items-center justify-between"><div className="text-xs w-full"><div className="flex justify-between mb-1"><span className="text-blue-400 font-bold">{duel.challengerName} ({duel.challengerProgress})</span><span className="text-slate-500 text-[10px]">vs</span><span className="text-red-400 font-bold">{duel.opponentName} ({duel.opponentProgress})</span></div><div className="text-[10px] text-slate-400 mb-2">{ACTIVITIES.find(a => a.id === duel.activityId)?.label} - Meta: {duel.targetAmount}</div>{duel.status === 'pending' ? (duel.opponentId === currentUser?.uid ? (<div className="flex gap-2"><button onClick={() => handleAcceptDuel(duel)} className="flex-1 bg-green-600 text-white py-1 rounded text-[10px] font-bold">ACEITAR</button><button onClick={() => handleCancelDuel(duel.id)} className="flex-1 bg-red-600 text-white py-1 rounded text-[10px] font-bold">RECUSAR</button></div>) : (<div className="flex flex-col gap-1"><div className="w-full text-center text-yellow-500 text-[10px]">Aguardando...</div><button onClick={() => handleCancelDuel(duel.id)} className="text-[9px] text-red-400 hover:text-red-300">Cancelar Desafio</button></div>)) : duel.status === 'finished' ? (<div className="w-full text-center font-bold text-[10px] text-yellow-400">🏆 Vencedor: {duel.winnerId === currentUser?.uid ? 'VOCÊ' : 'OPONENTE'}</div>) : (<div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden flex"><div className="h-full bg-blue-500" style={{ width: `${Math.min(100, (duel.challengerProgress / duel.targetAmount) * 100)}%` }}></div><div className="h-full bg-red-500" style={{ width: `${Math.min(100, (duel.opponentProgress / duel.targetAmount) * 100)}%` }}></div></div>)}</div></div>))}</div></div>)}
      <div className="grid grid-cols-2 gap-3"> {ACTIVITY_CATEGORIES.map(category => ( <button key={category.id} onClick={() => { setSelectedActivity(ACTIVITIES.find(a => category.types.includes(a.category)) || ACTIVITIES[0]); setIsActivityModalOpen(true); }} className={`p-4 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800 transition-all active:scale-95 flex flex-col items-center gap-2 group relative overflow-hidden`} > <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity ${category.color.replace('text', 'bg')}`}></div> <div className={`${category.color} mb-1 transform group-hover:scale-110 transition-transform`}>{getIcon(category.icon, "w-8 h-8")}</div> <span className="text-xs font-bold text-slate-300 text-center uppercase tracking-wide">{category.label}</span> </button> ))} </div>
      <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4"> <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2"> <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">{getIcon("Activity", "w-4 h-4")} Histórico Recente</h3> <div className="flex items-center gap-2"><button onClick={() => changeSummaryDate(-1)} className="p-1 hover:text-white text-slate-500">{getIcon("ChevronLeft", "w-4 h-4")}</button><span className="text-xs font-mono text-slate-400">{getDayLabel(summaryDate.getTime())}</span><button onClick={() => changeSummaryDate(1)} className={`p-1 hover:text-white text-slate-500 ${new Date(summaryDate).toDateString() === new Date().toDateString() ? 'opacity-30 cursor-not-allowed' : ''}`} disabled={new Date(summaryDate).toDateString() === new Date().toDateString()}>{getIcon("ChevronRight", "w-4 h-4")}</button></div> </div> {dailySummary.count === 0 ? ( <div className="text-center py-8 text-slate-600 text-sm">Nenhuma atividade registrada nesta data.</div> ) : ( <div className="space-y-3"> {dailySummary.list.map((item, idx) => ( <div key={idx} className="bg-slate-800/50 rounded-lg p-3 flex justify-between items-center border border-slate-700/50"> <div className="flex items-center gap-3"> <div className="p-2 bg-slate-900 rounded-lg text-slate-400">{getIcon(item.activity.icon, "w-5 h-5")}</div> <div> <h4 className="font-bold text-sm text-slate-200">{item.activity.label} <span className="text-slate-500 text-xs font-normal">x{item.count}</span></h4> <div className="text-xs text-slate-500 mt-0.5"> {item.totalAmount} {item.activity.unit} • {item.details.length > 0 && <span className="text-slate-400 italic">{item.details[0]} {item.details.length > 1 && `(+${item.details.length - 1})`}</span>} </div> </div> </div> </div> ))} <div className="mt-4 pt-3 border-t border-slate-700 flex justify-between items-center text-xs text-slate-400"> <span>Total XP do dia</span> <span className="font-bold text-emerald-400 text-sm">+{dailySummary.totalXp} XP</span> </div> </div> )} <div className="mt-6 flex justify-center"> <button onClick={() => setExpandedHistoryId(expandedHistoryId ? null : 'open')} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"> {expandedHistoryId ? 'Ocultar Histórico Completo' : 'Ver Histórico Completo'} {getIcon(expandedHistoryId ? "ChevronLeft" : "ChevronRight", "w-3 h-3")} </button> </div> {expandedHistoryId && ( <div className="mt-4 space-y-4 border-t border-slate-700 pt-4 animate-fade-in-up"> {historyGroups.map(([actId, logs]) => { const act = ACTIVITIES.find(a => a.id === actId); if (!act) return null; return ( <div key={actId} className="space-y-2"> <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">{getIcon(act.icon, "w-3 h-3")} {act.label}</h4> {logs.slice(0, 5).map(log => ( <div key={log.id} className="flex justify-between items-center text-xs bg-slate-900 p-2 rounded border border-slate-800"> <span className="text-slate-300">{new Date(log.timestamp).toLocaleTimeString()} - {log.amount} {act.unit} {log.details?.exercise && `(${log.details.exercise})`}</span> <div className="flex items-center gap-2"> <span className="text-emerald-500">+{log.xpGained} XP</span> <button onClick={() => handleDeleteLog(log.id)} className="text-slate-600 hover:text-red-400 transition-colors">{getIcon("Trash", "w-3 h-3")}</button> </div> </div> ))} </div> ); })} </div> )} </div>
      </main>

      <Modal isOpen={isActivityModalOpen} onClose={() => { setIsActivityModalOpen(false); setSelectedActivity(null); setInputAmount(''); }} title={selectedActivity ? selectedActivity.label : 'Nova Atividade'}>
        <div className="space-y-6">
          {!selectedActivity ? (
            <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1"> {ACTIVITIES.map(act => ( <button key={act.id} onClick={() => setSelectedActivity(act)} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 flex items-center gap-3 text-left transition-colors"> <div className="text-slate-400">{getIcon(act.icon)}</div> <div> <div className="font-bold text-xs text-slate-200">{act.label}</div> <div className="text-[10px] text-slate-500">+{act.xpPerUnit} XP / {act.unit}</div> </div> </button> ))} </div>
          ) : (
            <div className="animate-fade-in-up">
              <div className="flex items-center gap-4 mb-6 bg-slate-800 p-4 rounded-xl border border-slate-700"> <div className="p-3 bg-slate-900 rounded-full text-blue-400">{getIcon(selectedActivity.icon, "w-8 h-8")}</div> <div> <div className="text-sm text-slate-400 mb-1">Recompensa Base</div> <div className="font-bold text-emerald-400 text-lg">+{selectedActivity.xpPerUnit} XP <span className="text-xs text-slate-500 font-normal">/ {selectedActivity.unit}</span></div> {gameState.activeBuff && Date.now() < gameState.activeBuff.expiresAt && (<div className="text-[10px] text-purple-400 mt-1 flex items-center gap-1">{getIcon("Zap", "w-3 h-3")} Bônus Ativo: x{gameState.activeBuff.multiplier}</div>)} </div> </div>
              {selectedActivity.id === 'gym' ? (
                <div className="space-y-4">
                  <div>
                     <label className="text-xs text-slate-400 font-bold uppercase mb-2 block">Exercício</label>
                     <div className="relative">
                        <input value={gymExercise} onChange={e => { setGymExercise(e.target.value); setShowGymSuggestions(true); }} placeholder="Ex: Supino, Agachamento..." className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none" onFocus={() => setShowGymSuggestions(true)} onBlur={() => setTimeout(() => setShowGymSuggestions(false), 200)} />
                        {showGymSuggestions && filteredExercises.length > 0 && ( <div className="absolute z-50 w-full bg-slate-900 border border-slate-700 rounded-lg mt-1 max-h-40 overflow-y-auto shadow-xl"> {filteredExercises.map(ex => ( <div key={ex} className="p-2 hover:bg-slate-800 cursor-pointer text-sm text-slate-300" onClick={() => { setGymExercise(ex); setShowGymSuggestions(false); }}>{ex}</div> ))} </div> )}
                     </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div><label className="text-xs text-slate-400 font-bold uppercase mb-2 block">Carga (Kg)</label><input type="number" inputMode="decimal" value={gymWeight} onChange={e => setGymWeight(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none" placeholder="0" /></div>
                     <div><label className="text-xs text-slate-400 font-bold uppercase mb-2 block">Repetições</label><input type="number" inputMode="numeric" value={gymReps} onChange={e => setGymReps(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none" placeholder="0" /></div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-bold uppercase mb-2 block">Tempo de Descanso</label>
                    <select value={gymRestTime} onChange={e => setGymRestTime(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white"> <option value="00:00">Sem descanso</option> <option value="00:30">30 seg</option> <option value="01:00">1 min</option> <option value="01:30">1 min 30s</option> <option value="02:00">2 min</option> <option value="03:00">3 min</option> <option value="05:00">5 min</option> </select>
                  </div>
                  {/* TIMER CONTROLS INSIDE MODAL */}
                  {timerTimeLeft > 0 && (
                      <div className="p-4 bg-slate-950 rounded-xl border border-blue-500/50 flex flex-col items-center animate-pulse-fast">
                          <span className="text-xs text-blue-400 uppercase font-bold mb-1">Descanso Ativo</span>
                          <span className="text-4xl font-mono font-bold text-white mb-3">
                              {Math.floor(timerTimeLeft / 60)}:{(timerTimeLeft % 60).toString().padStart(2, '0')}
                          </span>
                          <div className="flex gap-2 w-full">
                              <button onClick={handleAddTimerTime} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-xs py-2 rounded flex items-center justify-center gap-1">
                                  {getIcon("Plus", "w-3 h-3")} +30s
                              </button>
                              <button onClick={handleCancelTimer} className="flex-1 bg-red-900/50 hover:bg-red-900 text-red-300 text-xs py-2 rounded flex items-center justify-center gap-1">
                                  {getIcon("X", "w-3 h-3")} Cancelar Tempo
                              </button>
                          </div>
                      </div>
                  )}
                </div>
              ) : selectedActivity.id === 'run' ? (
                 <div className="space-y-4">
                     <div><label className="text-xs text-slate-400 font-bold uppercase mb-2 block">Distância (km)</label><input type="number" step="0.01" value={runDistance} onChange={e => setRunDistance(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" placeholder="0.00" /></div>
                     <div><label className="text-xs text-slate-400 font-bold uppercase mb-2 block">Tempo Total (MM:SS)</label><input type="text" value={runDuration} onChange={e => { let v = e.target.value.replace(/[^0-9]/g, ''); if (v.length > 4) v = v.substring(0, 4); if (v.length >= 2) v = v.substring(0, 2) + ':' + v.substring(2); setRunDuration(v); }} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" placeholder="00:00" /></div>
                     {runDistance && runDuration && <div className="text-center text-sm text-slate-400">Pace Estimado: <strong className="text-white">{currentPace} /km</strong></div>}
                 </div>
              ) : ['shooting', 'archery', 'knife_throw'].includes(selectedActivity.id) ? (
                 <div className="space-y-4">
                     <div><label className="text-xs text-slate-400 font-bold uppercase mb-2 block">Arma / Equipamento</label><select value={targetTool} onChange={e => setTargetTool(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white"> <option value="">Selecione...</option> {selectedActivity.id === 'shooting' ? (<><option value="curta">Arma Curta (Pistola/Revólver)</option><option value="longa">Arma Longa (Fuzil/Carabina)</option><option value="espingarda">Espingarda (12/20)</option></>) : selectedActivity.id === 'archery' ? (<><option value="composto">Arco Composto</option><option value="recurvo">Arco Recurvo</option><option value="longbow">Longbow</option><option value="besta">Besta / Crossbow</option></>) : (<><option value="faca">Faca de Arremesso</option><option value="machado">Machadinha</option></>)} </select></div>
                     <div><label className="text-xs text-slate-400 font-bold uppercase mb-2 block">Distância (metros)</label><input type="number" value={targetDistance} onChange={e => setTargetDistance(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" /></div>
                     <div className="bg-slate-950 p-3 rounded-lg border border-slate-800"><div className="text-xs text-slate-500 uppercase mb-2 text-center">Pontuação no Alvo</div><div className="grid grid-cols-5 gap-1 text-center text-xs"> <div><div className="bg-red-500 w-full h-1 mb-1"></div>Center</div> <div><div className="bg-yellow-500 w-full h-1 mb-1"></div>10-9</div> <div><div className="bg-blue-500 w-full h-1 mb-1"></div>8-7</div> <div><div className="bg-black w-full h-1 mb-1"></div>6-5</div> <div><div className="bg-white w-full h-1 mb-1"></div>Out</div> </div> <div className="grid grid-cols-5 gap-1 mt-2"> <input type="number" className="bg-slate-900 text-center p-1 rounded" placeholder="0" onChange={e => setTargetHits({...targetHits, center: Number(e.target.value)})} /> <input type="number" className="bg-slate-900 text-center p-1 rounded" placeholder="0" onChange={e => setTargetHits({...targetHits, c1: Number(e.target.value)})} /> <input type="number" className="bg-slate-900 text-center p-1 rounded" placeholder="0" onChange={e => setTargetHits({...targetHits, c2: Number(e.target.value)})} /> <input type="number" className="bg-slate-900 text-center p-1 rounded" placeholder="0" onChange={e => setTargetHits({...targetHits, c3: Number(e.target.value)})} /> <input type="number" className="bg-slate-900 text-center p-1 rounded" placeholder="0" onChange={e => setTargetHits({...targetHits, outer: Number(e.target.value)})} /> </div> </div>
                 </div>
              ) : (
                <div><label className="text-xs text-slate-400 font-bold uppercase mb-2 block">Quantidade ({selectedActivity.unit})</label><input type="number" inputMode="numeric" autoFocus value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-4 text-2xl text-center text-white focus:border-blue-500 focus:outline-none font-mono" placeholder="0" /></div>
              )}
              <button 
                onClick={handleLogActivity} 
                disabled={selectedActivity.id === 'gym' && timerTimeLeft > 0}
                className={`w-full font-bold py-4 rounded-xl mt-6 shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center justify-center gap-2 ${selectedActivity.id === 'gym' && timerTimeLeft > 0 ? 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
              > 
                {selectedActivity.id === 'gym' && timerTimeLeft > 0 ? (
                    <>
                        {getIcon("Clock", "w-5 h-5")} 
                        AGUARDE O DESCANSO ({Math.floor(timerTimeLeft / 60)}:{(timerTimeLeft % 60).toString().padStart(2, '0')})
                    </>
                ) : (
                    <>
                        {getIcon("CheckCircle", "w-5 h-5")} 
                        CONCLUIR E GANHAR XP
                    </>
                )}
              </button>
            </div>
          )}
        </div>
      </Modal>

      <Modal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} title="Perfil do Herói" large>
        {isEditingProfile ? (
          <form onSubmit={handleUpdateProfile} className="space-y-4">
             <div className="flex justify-center mb-6"> <div className="relative group cursor-pointer w-24 h-24"> <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-slate-700 bg-slate-800"> <img src={getAvatarUrl} className="w-full h-full object-cover" /> </div> <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"> {getIcon("Camera", "text-white")} </div> <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" /> </div> </div>
             <div className="grid grid-cols-2 gap-4"> <div><label className="block text-xs text-slate-400 mb-1">Peso (kg)</label><input name="weight" type="number" step="0.1" defaultValue={user.weight} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white" /></div> <div><label className="block text-xs text-slate-400 mb-1">Altura (cm)</label><input name="height" type="number" defaultValue={user.height} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white" /></div> <div><label className="block text-xs text-slate-400 mb-1">Gênero</label><select name="gender" defaultValue={user.gender} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white"><option>Masculino</option><option>Feminino</option><option>Outros</option></select></div> <div><label className="block text-xs text-slate-400 mb-1">Profissão</label><input name="profession" defaultValue={user.profession} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white" /></div> </div>
             <button type="submit" className="w-full bg-green-600 text-white py-3 rounded-xl font-bold mt-4">{getIcon("Save", "inline w-4 h-4 mr-2")} Salvar Alterações</button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
               <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-slate-600 bg-slate-800 flex-shrink-0"> <img src={getAvatarUrl} className="w-full h-full object-cover" /> </div>
               <div className="flex-1"> <h2 className="text-2xl font-bold text-white">{user.name}</h2> <p className="text-blue-400 font-bold uppercase text-sm mb-1">{gameState.classTitle}</p> <p className="text-slate-400 text-xs">Nível {gameState.level} • {user.profession}</p> <div className="flex gap-2 mt-3"> <div className="bg-slate-800 px-3 py-1 rounded text-xs text-slate-300"><strong>{user.weight}</strong> kg</div> <div className="bg-slate-800 px-3 py-1 rounded text-xs text-slate-300"><strong>{user.height}</strong> cm</div> </div> </div>
               <button onClick={() => setIsEditingProfile(true)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400">{getIcon("Pencil", "w-4 h-4")}</button>
            </div>
            <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800 flex justify-center"> <RadarChart attributes={gameState.attributes} /> </div>
            <div className="grid grid-cols-2 gap-3"> {Object.entries(gameState.attributes).map(([key, val]) => ( <div key={key} className="bg-slate-800 p-3 rounded-lg flex justify-between items-center border border-slate-700"> <span className="text-xs font-bold text-slate-400">{ATTRIBUTE_LABELS[key as Attribute]}</span> <span className="font-mono text-emerald-400 font-bold">{val}</span> </div> ))} </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={isQuestModalOpen} onClose={() => setIsQuestModalOpen(false)} title="Quadro de Missões">
        <div className="space-y-6">
          <div> <h4 className="text-sm font-bold text-yellow-500 uppercase tracking-wider mb-3 flex items-center gap-2">{getIcon("Calendar", "w-4 h-4")} Diárias</h4> <div className="space-y-3"> {basicDailyQuests.map(quest => { const act = ACTIVITIES.find(a => a.id === quest.activityId); return ( <div key={quest.id} className={`p-3 rounded-lg border flex items-center gap-3 ${quest.isClaimed ? 'bg-slate-900/30 border-slate-800 opacity-60' : quest.currentAmount >= quest.targetAmount ? 'bg-emerald-900/20 border-emerald-500/50' : 'bg-slate-800 border-slate-700'}`}> <div className={`${quest.currentAmount >= quest.targetAmount ? 'text-emerald-400' : 'text-slate-500'}`}>{getIcon(act?.icon || 'Circle', "w-6 h-6")}</div> <div className="flex-1"> <div className="text-sm font-bold text-slate-200">{act?.label || 'Missão'}</div> <div className="text-xs text-slate-500 mb-1">{quest.currentAmount} / {quest.targetAmount} {act?.unit}</div> <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${Math.min(100, (quest.currentAmount / quest.targetAmount) * 100)}%` }}></div></div> </div> {quest.isClaimed ? <div className="text-emerald-500">{getIcon("CheckCircle", "w-5 h-5")}</div> : quest.currentAmount >= quest.targetAmount ? <button onClick={() => handleClaimQuest(quest.id)} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded animate-pulse">PEGAR</button> : <div className="text-xs font-bold text-slate-600">+{quest.xpReward} XP</div>} </div> ); })} </div> </div>
          <div> <h4 className="text-sm font-bold text-orange-500 uppercase tracking-wider mb-3 flex items-center gap-2">{getIcon("Target", "w-4 h-4")} Treino de Classe</h4> {advancedDailyQuests.length === 0 ? <p className="text-xs text-slate-500 italic">Nenhuma missão de classe hoje.</p> : <div className="space-y-3"> {advancedDailyQuests.map(quest => { const act = ACTIVITIES.find(a => a.id === quest.activityId); return ( <div key={quest.id} className={`p-3 rounded-lg border flex items-center gap-3 ${quest.isClaimed ? 'bg-slate-900/30 border-slate-800 opacity-60' : 'bg-slate-800 border-orange-900/30'}`}> <div className={`${quest.currentAmount >= quest.targetAmount ? 'text-orange-400' : 'text-slate-500'}`}>{getIcon(act?.icon || 'Circle', "w-6 h-6")}</div> <div className="flex-1"> <div className="text-sm font-bold text-slate-200">{act?.label}</div> <div className="text-xs text-slate-500 mb-1">{quest.currentAmount} / {quest.targetAmount} {act?.unit}</div> <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden"><div className="h-full bg-orange-500" style={{ width: `${Math.min(100, (quest.currentAmount / quest.targetAmount) * 100)}%` }}></div></div> </div> {quest.isClaimed ? <div className="text-emerald-500">{getIcon("CheckCircle", "w-5 h-5")}</div> : quest.currentAmount >= quest.targetAmount ? <button onClick={() => handleClaimQuest(quest.id)} className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded animate-pulse">PEGAR</button> : <div className="text-xs font-bold text-slate-600">+{quest.xpReward} XP</div>} </div> ); })} </div> } </div>
          <div> <h4 className="text-sm font-bold text-purple-500 uppercase tracking-wider mb-3 flex items-center gap-2">{getIcon("Crown", "w-4 h-4")} Semanais</h4> <div className="space-y-3"> {weeklyQuests.map(quest => { const act = ACTIVITIES.find(a => a.id === quest.activityId); return ( <div key={quest.id} className={`p-3 rounded-lg border flex items-center gap-3 ${quest.isClaimed ? 'bg-slate-900/30 border-slate-800 opacity-60' : 'bg-slate-800 border-purple-900/30'}`}> <div className={`${quest.currentAmount >= quest.targetAmount ? 'text-purple-400' : 'text-slate-500'}`}>{getIcon(act?.icon || 'Circle', "w-6 h-6")}</div> <div className="flex-1"> <div className="text-sm font-bold text-slate-200">{act?.label}</div> <div className="text-xs text-slate-500 mb-1">{quest.currentAmount} / {quest.targetAmount} {act?.unit}</div> <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden"><div className="h-full bg-purple-500" style={{ width: `${Math.min(100, (quest.currentAmount / quest.targetAmount) * 100)}%` }}></div></div> </div> {quest.isClaimed ? <div className="text-emerald-500">{getIcon("CheckCircle", "w-5 h-5")}</div> : quest.currentAmount >= quest.targetAmount ? <button onClick={() => handleClaimQuest(quest.id)} className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded animate-pulse">PEGAR</button> : <div className="text-xs font-bold text-slate-600">+{quest.xpReward} XP</div>} </div> ); })} </div> </div>
        </div>
      </Modal>

      <Modal isOpen={isGuildModalOpen} onClose={() => setIsGuildModalOpen(false)} title="Guilda" large>
        <div className="min-h-[300px]">
           {!currentGuild ? (
               <div className="space-y-6 text-center py-10">
                   <div className="text-slate-500 mb-4">{getIcon("Shield", "w-16 h-16 mx-auto opacity-50")}</div>
                   <h3 className="text-xl font-bold text-white">Você não tem guilda</h3>
                   <div className="flex flex-col gap-4 max-w-xs mx-auto">
                       <div> <input placeholder="ID da Guilda" value={guildInputId} onChange={e => setGuildInputId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 p-2 rounded mb-2 text-center" /> <button onClick={handleJoinGuild} className="w-full bg-blue-600 p-2 rounded font-bold text-sm">Entrar em Guilda</button> </div>
                       <div className="relative flex py-2 items-center"><div className="flex-grow border-t border-slate-700"></div><span className="flex-shrink-0 mx-4 text-slate-500 text-xs">OU</span><div className="flex-grow border-t border-slate-700"></div></div>
                       <div> <input placeholder="Nome da Nova Guilda" value={guildCreateName} onChange={e => setGuildCreateName(e.target.value)} className="w-full bg-slate-950 border border-slate-700 p-2 rounded mb-2 text-center" /> <button onClick={handleCreateGuild} className="w-full bg-emerald-600 p-2 rounded font-bold text-sm">Criar Guilda</button> </div>
                   </div>
               </div>
           ) : (
               <div className="flex flex-col h-[500px]">
                   <div className="flex border-b border-slate-700 mb-4">
                       <button onClick={() => setGuildTab('info')} className={`flex-1 py-2 text-sm font-bold ${guildTab === 'info' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}>Membros</button>
                       <button onClick={() => setGuildTab('chat')} className={`flex-1 py-2 text-sm font-bold ${guildTab === 'chat' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}>Chat</button>
                       <button onClick={() => setGuildTab('raid')} className={`flex-1 py-2 text-sm font-bold ${guildTab === 'raid' ? 'text-red-400 border-b-2 border-red-400' : 'text-slate-500'}`}>Chefe</button>
                   </div>
                   {guildTab === 'info' && (
                       <div className="overflow-y-auto flex-1 space-y-2">
                           <div className="bg-slate-800 p-3 rounded mb-2"><h2 className="font-bold text-lg">{currentGuild.name}</h2><p className="text-xs text-slate-400">ID: {currentGuild.id}</p></div>
                           {(Object.values(currentGuild.members) as GuildMember[]).sort((a,b) => b.level - a.level).map(member => ( <div key={member.uid} className="flex items-center gap-3 p-2 bg-slate-900/50 rounded border border-slate-800"> <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden"><img src={member.avatar || ''} className="w-full h-full object-cover" /></div> <div className="flex-1"> <div className="text-sm font-bold text-slate-200">{member.name} {member.role === 'leader' && '👑'}</div> <div className="text-xs text-blue-400">{member.classTitle} • Lvl {member.level}</div> </div> </div> ))}
                       </div>
                   )}
                   {guildTab === 'chat' && (
                       <div className="flex flex-col h-full">
                           <div className="flex-1 overflow-y-auto space-y-3 p-2 bg-slate-950/30 rounded border border-slate-800 mb-2"> {chatMessages.map((msg, i) => ( <div key={i} className={`flex flex-col ${msg.senderId === currentUser?.uid ? 'items-end' : 'items-start'}`}> {msg.type === 'system' ? ( <div className="w-full text-center text-[10px] text-yellow-500 my-2 italic border-y border-slate-800 py-1">{msg.text}</div> ) : ( <div className={`max-w-[80%] p-2 rounded-lg text-xs ${msg.senderId === currentUser?.uid ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-700 text-slate-200 rounded-tl-none'}`}> <div className="font-bold text-[10px] opacity-70 mb-0.5">{msg.senderName}</div> {msg.text} </div> )} </div> ))} <div ref={chatEndRef}></div> </div>
                           <div className="flex gap-2"> <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-1 bg-slate-950 border border-slate-700 p-2 rounded text-sm" placeholder="Mensagem..." /> <button onClick={handleSendMessage} className="bg-blue-600 p-2 rounded text-white">{getIcon("MessageSquare", "w-4 h-4")}</button> </div>
                       </div>
                   )}
                   {guildTab === 'raid' && currentGuild.boss && (
                       <div className="text-center space-y-4 flex-1 flex flex-col items-center justify-center">
                           <div className="text-6xl animate-bounce">{currentGuild.boss.image}</div>
                           <h3 className="text-2xl font-black text-red-500">{currentGuild.boss.name} <span className="text-sm text-slate-400">Lvl {currentGuild.boss.level}</span></h3>
                           <div className="w-full max-w-xs space-y-1"> <div className="flex justify-between text-xs font-bold text-red-300"><span>HP</span><span>{currentGuild.boss.currentHp} / {currentGuild.boss.maxHp}</span></div> <ProgressBar current={currentGuild.boss.currentHp} max={currentGuild.boss.maxHp} color="bg-red-600" /> </div>
                           <button onClick={handleAttackBoss} className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-red-900/50 active:scale-95 transition-all text-lg flex items-center gap-2"> {getIcon("Swords", "w-6 h-6")} ATACAR </button>
                           <p className="text-xs text-slate-500">Dano baseado no seu nível atual.</p>
                       </div>
                   )}
               </div>
           )}
        </div>
      </Modal>

      <Modal isOpen={isRankModalOpen} onClose={() => setIsRankModalOpen(false)} title="Ranking Global" large>
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2"> {['Todos', ...RPG_CLASSES].map(c => ( <button key={c} onClick={() => setRankFilter(c)} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${rankFilter === c ? 'bg-yellow-500 text-black' : 'bg-slate-800 text-slate-400'}`}>{c}</button> ))} </div>
          <div className="space-y-2 max-h-[400px] overflow-y-auto"> {rankingList.map((profile, i) => ( <div key={profile.uid} className="bg-slate-800 p-3 rounded-lg flex items-center gap-3 border border-slate-700"> <div className="font-mono text-xl font-bold text-slate-500 w-8">#{i + 1}</div> <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden"><img src={profile.avatarImage || `https://api.dicebear.com/9.x/micah/svg?seed=${profile.name}`} className="w-full h-full object-cover" /></div> <div className="flex-1"> <div className="font-bold text-slate-200 text-sm">{profile.name}</div> <div className="text-xs text-yellow-500">{profile.classTitle} • Lvl {profile.level}</div> </div> <div className="text-right"> <div className="font-bold text-emerald-400 text-sm">{profile.totalXp.toLocaleString()} XP</div> {profile.uid !== currentUser?.uid && ( <button onClick={() => setViewingProfile(profile)} className="text-[10px] bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded mt-1">Ver Perfil</button> )} </div> </div> ))} </div>
          {viewingProfile && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80">
                  <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm p-4 shadow-2xl relative">
                      <button onClick={() => setViewingProfile(null)} className="absolute top-2 right-2 text-slate-400">{getIcon("X")}</button>
                      <div className="text-center mb-4"> <div className="w-20 h-20 rounded-full mx-auto overflow-hidden border-2 border-yellow-500 mb-2"><img src={viewingProfile.avatarImage || ''} className="w-full h-full object-cover" /></div> <h3 className="text-xl font-bold text-white">{viewingProfile.name}</h3> <p className="text-yellow-500 text-sm">{viewingProfile.classTitle} • Lvl {viewingProfile.level}</p> </div>
                      <div className="flex justify-center mb-4"><RadarChart attributes={viewingProfile.attributes} /></div>
                      <button onClick={() => handleOpenChallenge(viewingProfile)} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2"> {getIcon("Swords", "w-5 h-5")} DESAFIAR PARA DUELO </button>
                  </div>
              </div>
          )}
      </Modal>

      <Modal isOpen={isChallengeModalOpen} onClose={() => setIsChallengeModalOpen(false)} title="Configurar Duelo">
          <div className="space-y-4">
              <div className="bg-slate-800 p-3 rounded-lg text-center"> <span className="text-slate-400 text-xs">Oponente</span> <h3 className="text-lg font-bold text-white">{challengeOpponent?.name}</h3> </div>
              <div> <label className="text-xs text-slate-400 font-bold uppercase mb-2 block">Atividade do Duelo</label> <select value={challengeActivityId} onChange={e => setChallengeActivityId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white"> {ACTIVITIES.filter(a => a.category !== 'bad_habit' && a.category !== 'social').map(a => ( <option key={a.id} value={a.id}>{a.label} ({a.unit})</option> ))} </select> </div>
              <div> <label className="text-xs text-slate-400 font-bold uppercase mb-2 block">Meta para Vencer</label> <input type="number" value={challengeTarget} onChange={e => setChallengeTarget(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" placeholder="Ex: 50" /> </div>
              <button onClick={handleSubmitChallenge} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2"> {getIcon("Swords", "w-5 h-5")} ENVIAR DESAFIO </button>
          </div>
      </Modal>

      <Modal isOpen={isMapModalOpen} onClose={() => setIsMapModalOpen(false)} title="Mapa de Territórios" large>
        <div className="h-[60vh] rounded-xl overflow-hidden relative">
            {userLocation ? (
                <MapContainer center={[userLocation.lat, userLocation.lng]} zoom={15} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap' />
                    <RecenterMap lat={userLocation.lat} lng={userLocation.lng} />
                    <Marker position={[userLocation.lat, userLocation.lng]} icon={L.divIcon({className: 'bg-transparent', html: '<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg animate-pulse"></div>'})}>
                        <Popup>Você está aqui</Popup>
                    </Marker>
                    {territories.map(t => (
                        <React.Fragment key={t.id}>
                            <Circle center={[t.lat, t.lng]} radius={t.radius} pathOptions={{ color: t.ownerId ? '#eab308' : '#334155', fillColor: t.ownerId ? '#eab308' : '#1e293b', fillOpacity: 0.4 }} eventHandlers={{ click: () => setSelectedTerritory(t) }} />
                            {t.ownerId && (
                                <Marker position={[t.lat, t.lng]} icon={getOwnerIcon(t.ownerAvatar || '')} eventHandlers={{ click: () => setSelectedTerritory(t) }} />
                            )}
                        </React.Fragment>
                    ))}
                    {user.role === 'admin' && <LocationSelector onSelect={(lat, lng) => setAdminSelectedLocation({lat, lng})} />}
                </MapContainer>
            ) : ( <div className="flex items-center justify-center h-full text-slate-500">Carregando GPS...</div> )}
        </div>
        {selectedTerritory && (
            <div className="mt-4 bg-slate-800 p-4 rounded-xl border border-slate-700">
                <div className="flex justify-between items-start mb-4">
                    <div> <h3 className="font-bold text-lg text-white">{selectedTerritory.name}</h3> <p className="text-xs text-slate-400">Raio: {selectedTerritory.radius}m</p> </div>
                    {user.role === 'admin' && <button onClick={() => { if(window.confirm("Deletar território?")) deleteTerritory(selectedTerritory.id); setSelectedTerritory(null); }} className="text-red-500 text-xs hover:underline">Deletar (Admin)</button>}
                </div>
                {selectedTerritory.ownerId ? ( <div className="flex items-center gap-3 bg-yellow-900/20 p-3 rounded-lg border border-yellow-700/50 mb-4"> <div className="w-10 h-10 rounded-full bg-slate-900 overflow-hidden border border-yellow-500"><img src={selectedTerritory.ownerAvatar} className="w-full h-full object-cover" /></div> <div> <div className="text-xs text-yellow-500 uppercase font-bold">Dominante Atual</div> <div className="font-bold text-white">{selectedTerritory.ownerName}</div> <div className="text-[10px] text-slate-400">{selectedTerritory.ownerKillCount} abates aqui</div> </div> </div> ) : ( <div className="text-xs text-slate-500 italic mb-4">Território sem dono. Complete desafios para dominar!</div> )}
                
                <h4 className="text-sm font-bold text-slate-300 mb-2 uppercase flex items-center gap-2">{getIcon("Swords", "w-4 h-4")} Inimigos na Área</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedTerritory.enemies.length === 0 && <p className="text-xs text-slate-500">Nenhum inimigo avistado.</p>}
                    {selectedTerritory.enemies.map(enemy => {
                         const myProgress = userTerritoryStats?.enemyProgress[enemy.id];
                         const currentLevel = myProgress ? myProgress.level : 1;
                         const currentTarget = myProgress ? myProgress.currentTarget : enemy.baseTarget;
                         const currentProg = myProgress ? myProgress.currentProgress : 0;
                         return (
                            <div key={enemy.id} className="bg-slate-900 p-2 rounded flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl">{enemy.image}</span>
                                    <div>
                                        <div className="text-sm font-bold text-white">{enemy.name} <span className="text-xs text-red-400">Lvl {currentLevel}</span></div>
                                        <div className="text-[10px] text-slate-400">{ACTIVITIES.find(a => a.id === enemy.activityId)?.label} • Meta: {currentTarget}</div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <button onClick={() => { setIsMapModalOpen(false); handleChallengeEnemy(enemy); }} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold rounded">ATACAR</button>
                                    <div className="text-[9px] text-slate-500">{currentProg}/{currentTarget}</div>
                                </div>
                            </div>
                         );
                    })}
                </div>
            </div>
        )}
      </Modal>

      <Modal isOpen={isAdminModalOpen} onClose={() => setIsAdminModalOpen(false)} title="Painel Admin" large>
          <div className="space-y-8">
              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                  <h3 className="font-bold text-emerald-400 mb-4 flex items-center gap-2">{getIcon("MapPin", "w-5 h-5")} Criar Território</h3>
                  {adminSelectedLocation ? (
                      <div className="space-y-3">
                          <p className="text-xs text-slate-400">Local selecionado: {adminSelectedLocation.lat.toFixed(4)}, {adminSelectedLocation.lng.toFixed(4)}</p>
                          <input placeholder="Nome do Território" value={newTerritoryName} onChange={e => setNewTerritoryName(e.target.value)} className="w-full bg-slate-950 border border-slate-700 p-2 rounded text-white" />
                          <div> <label className="text-xs text-slate-400">Raio (metros)</label> <input type="number" value={newTerritoryRadius} onChange={e => setNewTerritoryRadius(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 p-2 rounded text-white" /> </div>
                          <button onClick={handleCreateTerritory} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded">Criar Território Aqui</button>
                      </div>
                  ) : <p className="text-sm text-yellow-500">Selecione um ponto no mapa (Menu Mapa) para criar.</p>}
              </div>

              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                  <h3 className="font-bold text-red-400 mb-4 flex items-center gap-2">{getIcon("Skull", "w-5 h-5")} Adicionar Inimigo a Território</h3>
                  <select value={selectedAdminTerritoryId} onChange={e => setSelectedAdminTerritoryId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 p-2 rounded mb-3 text-white"> <option value="">Selecione o Território...</option> {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)} </select>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                      <input placeholder="Nome do Inimigo" value={newEnemyName} onChange={e => setNewEnemyName(e.target.value)} className="bg-slate-950 border border-slate-700 p-2 rounded text-white" />
                      <select value={newEnemyActivityId} onChange={e => setNewEnemyActivityId(e.target.value)} className="bg-slate-950 border border-slate-700 p-2 rounded text-white"> {ACTIVITIES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)} </select>
                      <input type="number" placeholder="Meta Base" value={newEnemyTarget} onChange={e => setNewEnemyTarget(Number(e.target.value))} className="bg-slate-950 border border-slate-700 p-2 rounded text-white" />
                      <input type="number" placeholder="XP Recompensa" value={newEnemyXp} onChange={e => setNewEnemyXp(Number(e.target.value))} className="bg-slate-950 border border-slate-700 p-2 rounded text-white" />
                  </div>
                  <button onClick={handleAddEnemyToTerritory} disabled={!selectedAdminTerritoryId} className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold py-2 rounded">Invocar Inimigo</button>
              </div>

              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                  <h3 className="font-bold text-slate-300 mb-4">Gerenciar Usuários</h3>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                      {userList.map(u => (
                          <div key={u.uid} className="flex justify-between items-center bg-slate-900 p-2 rounded">
                              <span className="text-xs text-white">{u.name} ({u.level})</span>
                              <button onClick={() => banUser(u.uid)} className="text-[10px] bg-red-900 text-red-300 px-2 py-1 rounded hover:bg-red-700">Banir/Deletar</button>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      </Modal>

      {timerTimeLeft > 0 && !isActivityModalOpen && (
          <div className="fixed bottom-20 right-4 left-4 z-50 animate-bounce-in">
              <div className="bg-slate-900/90 backdrop-blur-md border border-blue-500 rounded-2xl shadow-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      <div className="p-3 bg-blue-500/20 rounded-full animate-pulse text-blue-400">
                          {getIcon("Timer", "w-6 h-6")}
                      </div>
                      <div>
                          <div className="text-[10px] text-blue-300 uppercase font-bold tracking-wider">Descanso Ativo</div>
                          <div className="text-3xl font-mono font-bold text-white leading-none">
                              {Math.floor(timerTimeLeft / 60)}:{(timerTimeLeft % 60).toString().padStart(2, '0')}
                          </div>
                      </div>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={handleAddTimerTime} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-white border border-slate-600 active:scale-95 transition-all">
                          {getIcon("Plus", "w-5 h-5")}
                      </button>
                      <button onClick={handleCancelTimer} className="p-3 bg-red-900/50 hover:bg-red-900 rounded-xl text-red-200 border border-red-800 active:scale-95 transition-all">
                          {getIcon("X", "w-5 h-5")}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
