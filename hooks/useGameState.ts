
import { useState, useEffect, useRef } from 'react';
import { UserProfile, GameState, ActivityLog, Quest, ACTIVITIES } from '../types';
import { auth, loadUserDataFromCloud, saveUserDataToCloud, checkRedirectResult } from '../firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { generateRpgFlavorText, NarratorTrigger } from '../services/geminiService';
import { calculateXpForNextLevel, determineClass, generateNewQuests } from '../logic/gameLogic';

const initialGameState: GameState = {
  level: 1, currentXp: 0, totalXp: 0, logs: [], classTitle: "NPC",
  attributes: { STR: 0, END: 0, VIG: 0, AGI: 0, DEX: 0, INT: 0, CHA: 0, DRV: 0 },
  activeBuff: null, quests: []
};

export function useGameState() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [narratorText, setNarratorText] = useState("Bem-vindo ao LifeRPG.");
  const [loadingAi, setLoadingAi] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true); // Novo estado para evitar flicker
  
  const hasNarratorRunRef = useRef(false);

  // Sync state with cloud when online
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      const needsSync = localStorage.getItem('liferpg_needs_sync') === 'true';
      if (needsSync && currentUser && user) {
        setIsSyncing(true);
        saveUserDataToCloud(currentUser.uid, user, gameState).then(success => {
          if (success) localStorage.removeItem('liferpg_needs_sync');
          setIsSyncing(false);
        });
      }
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [currentUser, user, gameState]);

  // Auth & Initial Load
  useEffect(() => {
    const initAuth = async () => {
      setLoadingAuth(true);
      // Verificar se houve retorno de redirecionamento do Google
      await checkRedirectResult();

      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        setCurrentUser(firebaseUser);
        if (firebaseUser) {
          const cloudData = await loadUserDataFromCloud(firebaseUser.uid);
          if (cloudData) {
            setUser(cloudData.userProfile);
            const cloudGame = cloudData.gameState;
            const { quests, lastDaily, lastWeekly } = generateNewQuests(
              cloudGame.quests || [], cloudGame.classTitle || "NPC",
              cloudGame.lastDailyQuestGen, cloudGame.lastWeeklyQuestGen
            );
            const newState = { ...cloudGame, quests, lastDailyQuestGen: lastDaily, lastWeeklyQuestGen: lastWeekly };
            setGameState(newState);
            if (!hasNarratorRunRef.current) {
              hasNarratorRunRef.current = true;
              updateNarrator(cloudData.userProfile, newState, undefined, 'login');
            }
          } else {
            // Usuário logado mas sem perfil no Firestore (ex: novo login Google)
            setUser(null);
          }
        } else {
          setUser(null);
          setGameState(initialGameState);
          hasNarratorRunRef.current = false;
          localStorage.removeItem('liferpg_user');
        }
        setLoadingAuth(false);
      });
      return unsubscribe;
    };

    let unsub: any;
    initAuth().then(u => unsub = u);
    return () => unsub && unsub();
  }, []);

  const updateNarrator = async (u: UserProfile, g: GameState, activityName?: string, trigger: NarratorTrigger = 'activity') => {
    if (!navigator.onLine) {
      setNarratorText(trigger === 'login' ? "Modo Offline." : "Atividade Salva.");
      return;
    }
    setLoadingAi(true);
    try {
      const text = await generateRpgFlavorText(u, g, trigger, activityName);
      setNarratorText(text);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAi(false);
    }
  };

  const addLog = (log: ActivityLog, newAttributes: Record<string, number>) => {
    let xpGained = log.xpGained;
    if (gameState.activeBuff && Date.now() < gameState.activeBuff.expiresAt) {
      xpGained = Math.floor(xpGained * gameState.activeBuff.multiplier);
    }

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

    const updatedQuests = gameState.quests.map(q => {
      if (!q.isClaimed && q.activityId === log.activityId) {
        return { ...q, currentAmount: q.currentAmount + log.amount };
      }
      return q;
    });

    const updatedLogs = [{...log, xpGained}, ...gameState.logs].slice(0, 50);
    const newClass = determineClass(newAttributes as any, user?.weight || 0, user?.height || 0, updatedLogs);

    const newState = {
      ...gameState,
      level: newLevel, currentXp: newCurrentXp, totalXp: newTotalXp,
      logs: updatedLogs, attributes: newAttributes as any,
      classTitle: newClass, quests: updatedQuests
    };

    setGameState(newState);
    if (leveledUp) {
      setShowLevelUp(true);
      setTimeout(() => setShowLevelUp(false), 5000);
      updateNarrator(user!, newState, "LEVEL UP", 'level_up');
    } else {
      const act = ACTIVITIES.find(a => a.id === log.activityId);
      updateNarrator(user!, newState, act?.label, 'activity');
    }
  };

  return {
    user, setUser,
    gameState, setGameState,
    currentUser, isSyncing, isOnline,
    narratorText, loadingAi, showLevelUp,
    addLog, updateNarrator, loadingAuth
  };
}
