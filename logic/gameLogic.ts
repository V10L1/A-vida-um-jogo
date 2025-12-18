
import { Attribute, ActivityLog, ACTIVITIES, ActivityType, Quest, UserProfile, GameState } from '../types';

export const XP_FOR_NEXT_LEVEL_BASE = 100;

export const ATROPHY_THRESHOLDS: Record<Attribute, number> = {
  STR: 14, VIG: 14, INT: 14, AGI: 18, END: 21, DEX: 25, CHA: 21, DRV: 30
};

export const calculateXpForNextLevel = (level: number) => {
  return level * XP_FOR_NEXT_LEVEL_BASE;
};

export const calculateBmiBonus = (weight: number, height: number): number => {
  if (weight <= 0 || height <= 0) return 0;
  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);

  if (bmi > 40.0) return 20; 
  if (bmi >= 30.0) return 15; 
  if (bmi >= 25.0) return 10; 
  if (bmi >= 23.41) return 5; 
  return 0; 
};

export const determineClass = (attrs: Record<Attribute, number>, weight: number, height: number, logs: ActivityLog[]): string => {
  let maxAttr: Attribute = 'STR';
  let maxVal = -1;
  
  for (const key of Object.keys(attrs) as Attribute[]) {
    if (attrs[key] > maxVal) {
        maxVal = attrs[key];
        maxAttr = key;
    }
  }

  if (maxVal < 10) return "NPC"; 

  let secondMaxAttr: Attribute | null = null;
  let secondMaxVal = -1;
  
  for (const key of Object.keys(attrs) as Attribute[]) {
    if (key !== maxAttr && attrs[key] > secondMaxVal) {
        secondMaxVal = attrs[key];
        secondMaxAttr = key;
    }
  }

  const isSecondaryRelevant = secondMaxAttr && secondMaxVal > (maxVal * 0.4); 
  const heightM = height / 100;
  const bmi = weight > 0 && height > 0 ? weight / (heightM * heightM) : 22;

  let combatCount = 0;
  let fitnessCount = 0;
  logs.slice(0, 50).forEach(log => {
      const act = ACTIVITIES.find(a => a.id === log.activityId);
      if (act?.category === 'combat') combatCount++;
      if (act?.category === 'fitness') fitnessCount++;
  });

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
           if (isSecondaryRelevant && secondMaxAttr === 'STR') {
               if (bmi >= 28) return "Tanque";
               return "Crossfitter";
           }
           return "Atleta de Resistência";
      case 'AGI':
          if (isSecondaryRelevant && secondMaxAttr === 'DEX') return "Espadachim"; 
          return "Velocista";
      case 'DEX':
          if (isSecondaryRelevant && secondMaxAttr === 'STR') return "Lutador";
          if (isSecondaryRelevant && secondMaxAttr === 'AGI') return "Espadachim";
          return "Atirador";
      case 'INT': return "Mago";
      case 'CHA':
          if (isSecondaryRelevant && secondMaxAttr === 'INT') return "Conselheiro";
          return "Healer";
      case 'DRV': return "Motorista";
      default: return "Aventureiro";
  }
};

export const generateNewQuests = (currentQuests: Quest[], currentClass: string, lastDaily?: number, lastWeekly?: number): { quests: Quest[], lastDaily: number, lastWeekly: number } => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = now.getDay();
    const diff = now.getDate() - day;
    const weekStart = new Date(now.setDate(diff)).setHours(0,0,0,0);

    let newQuests = [...currentQuests];
    let newLastDaily = lastDaily || 0;
    let newLastWeekly = lastWeekly || 0;
    
    const BASIC_ACTIVITY_IDS = ['walk', 'run', 'pushup', 'abs', 'water'];
    const basicActivities = ACTIVITIES.filter(a => BASIC_ACTIVITY_IDS.includes(a.id));
    const allClassActivities = ACTIVITIES.filter(a => !BASIC_ACTIVITY_IDS.includes(a.id) && a.category !== 'bad_habit');

    let filteredClassActivities = allClassActivities;
    if (currentClass.includes('Mago')) filteredClassActivities = allClassActivities.filter(a => a.category === 'intellect');
    else if (currentClass.includes('Healer') || currentClass.includes('Conselheiro')) filteredClassActivities = allClassActivities.filter(a => a.category === 'social');
    else if (currentClass === 'Motorista') filteredClassActivities = allClassActivities.filter(a => a.id === 'drive');
    else if (['Bodybuilder', 'Tanque', 'Lutador', 'Berseker', 'Guerreiro'].some(c => currentClass.includes(c))) filteredClassActivities = allClassActivities.filter(a => a.primaryAttribute === 'STR' || a.category === 'combat' || a.id === 'gym');
    else if (['Corredor', 'Biker', 'Velocista'].some(c => currentClass.includes(c))) filteredClassActivities = allClassActivities.filter(a => a.primaryAttribute === 'VIG' || a.id === 'bike' || a.id === 'hiit');
    else if (['Atirador', 'Pistoleiro', 'Espadachim'].some(c => currentClass.includes(c))) filteredClassActivities = allClassActivities.filter(a => a.primaryAttribute === 'DEX' || a.category === 'combat');

    if (filteredClassActivities.length === 0) filteredClassActivities = allClassActivities;

    const isBasicClass = currentClass === 'NPC' || currentClass === 'Aventureiro';
    const numBasicDaily = isBasicClass ? 3 : 2;
    const numClassDaily = isBasicClass ? 0 : 1;

    const getTarget = (act: ActivityType, type: 'daily' | 'weekly') => {
        let dailyBase = 1;
        if (act.unit === 'km') dailyBase = 3;
        if (act.unit === 'reps') dailyBase = 20;
        if (act.unit === 'min') dailyBase = 20;
        if (act.unit === 'copos') dailyBase = 6;
        if (act.unit === 'pág/min') dailyBase = 15;
        if (act.id === 'drive') dailyBase = 20;
        if (act.id === 'gym') dailyBase = 3;
        if (type === 'weekly') return dailyBase * 7;
        return dailyBase;
    };

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
