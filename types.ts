
export type Gender = 'Masculino' | 'Feminino' | 'Outros';

export interface UserProfile {
  name: string;
  dob: string;
  weight: number;
  height: number;
  gender: Gender;
  profession: string;
  avatarImage?: string; // Base64 string da imagem customizada
  role?: 'user' | 'admin'; // Role para painel administrativo
  guildId?: string;
}

// Novos Atributos de RPG
export type Attribute = 'STR' | 'END' | 'VIG' | 'AGI' | 'DEX' | 'INT' | 'CHA' | 'DRV';

export interface ActivityType {
  id: string;
  label: string;
  xpPerUnit: number;
  unit: string;
  icon: string;
  category: 'fitness' | 'intellect' | 'health' | 'combat' | 'social' | 'bad_habit';
  // Agora a atividade dá pontos para atributos especificos
  primaryAttribute?: Attribute;
  secondaryAttribute?: Attribute;
}

export interface ActivityLog {
  id: string;
  activityId: string;
  amount: number;
  xpGained: number;
  timestamp: number;
  details?: {
    exercise?: string;
    weight?: number;
    reps?: number;
    restTime?: number;
    distance?: number; // km
    duration?: string; // MM:SS
    pace?: string; // MM:SS /km
    weapon?: string; 
    hits?: {
        center: number;
        c1: number;
        c2: number;
        c3: number;
        outer: number;
    };
  };
}

export interface XpBuff {
  multiplier: number; 
  expiresAt: number; 
  description: string;
}

export interface Quest {
  id: string;
  type: 'daily' | 'weekly';
  activityId: string; 
  targetAmount: number; 
  currentAmount: number; 
  xpReward: number; 
  isClaimed: boolean; 
  createdAt: number; 
}

export interface GuildMember {
    uid: string;
    name: string;
    level: number;
    role: 'leader' | 'member';
    avatar?: string;
    classTitle: string;
}

export interface ChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    text: string;
    timestamp: number;
    type: 'text' | 'system'; 
}

export interface Boss {
    currentHp: number;
    maxHp: number;
    level: number;
    name: string; 
    image: string; 
}

export interface Guild {
    id: string;
    name: string;
    description: string;
    level: number;
    members: Record<string, GuildMember>; 
    xp: number; 
    boss?: Boss;
}

// --- TERRITORY SYSTEM UPDATED ---

export interface TerritoryEnemyTemplate {
    id: string;
    name: string;
    image: string; // Emoji
    activityId: string; // Ex: 'pushup'
    baseTarget: number; // Ex: 10 reps
    xpReward: number;
}

export interface Territory {
    id: string;
    name: string;
    lat: number;
    lng: number;
    radius: number; // meters
    ownerId?: string;
    ownerName?: string;
    ownerAvatar?: string; // Avatar do dono
    ownerKillCount: number; // Quantos inimigos o dono matou neste local
    enemies: TerritoryEnemyTemplate[]; // Lista de inimigos disponiveis
}

export interface TerritoryEnemyProgress {
    level: number;
    currentTarget: number;
    currentProgress: number;
}

export interface TerritoryPlayerStats {
    totalKills: number;
    enemyProgress: Record<string, TerritoryEnemyProgress>; // Map enemyId -> Progress
}

export interface GameState {
  level: number;
  currentXp: number;
  totalXp: number;
  logs: ActivityLog[];
  classTitle: string; 
  attributes: Record<Attribute, number>; 
  activeBuff?: XpBuff | null;
  quests: Quest[]; 
  lastDailyQuestGen?: number; 
  lastWeeklyQuestGen?: number; 
  lastAtrophyCheck?: number; 
  guildId?: string | null; 
}

// --- MULTIPLAYER & PVP ---

export interface PublicProfile {
    uid: string;
    name: string;
    level: number;
    classTitle: string;
    totalXp: number;
    avatarImage?: string;
    attributes: Record<Attribute, number>;
}

export type DuelStatus = 'pending' | 'active' | 'finished';

export interface Duel {
    id: string;
    challengerId: string;
    challengerName: string;
    opponentId: string;
    opponentName: string;
    activityId: string; 
    targetAmount: number; 
    challengerProgress: number;
    opponentProgress: number;
    status: DuelStatus;
    winnerId?: string;
    createdAt: number;
}

export const RPG_CLASSES = [
  'Corredor', 'Biker', 'Lutador', 'Guerreiro', 'Tanque', 
  'Berseker', 'Bodybuilder', 'Espadachim', 'Healer', 
  'Atirador', 'Pistoleiro', 'Conselheiro', 'Mago', 'Motorista', 'NPC'
];

export const ATTRIBUTE_LABELS: Record<Attribute, string> = {
    STR: 'Força',
    END: 'Resistência',
    VIG: 'Vigor',
    AGI: 'Agilidade',
    DEX: 'Destreza',
    INT: 'Intelecto',
    CHA: 'Carisma',
    DRV: 'Volante'
};

export const BASIC_ACTIVITY_IDS = ['walk', 'run', 'pushup', 'abs', 'water'];

export const ACTIVITIES: ActivityType[] = [
  { id: 'walk', label: 'Caminhada Leve', xpPerUnit: 15, unit: 'km', icon: 'Footprints', category: 'fitness', primaryAttribute: 'VIG' },
  { id: 'run', label: 'Corrida', xpPerUnit: 30, unit: 'km', icon: 'Wind', category: 'fitness', primaryAttribute: 'VIG', secondaryAttribute: 'AGI' },
  { id: 'pushup', label: 'Flexões', xpPerUnit: 2, unit: 'reps', icon: 'Dumbbell', category: 'fitness', primaryAttribute: 'STR', secondaryAttribute: 'END' },
  { id: 'abs', label: 'Abdominais', xpPerUnit: 2, unit: 'reps', icon: 'ArrowBigUp', category: 'fitness', primaryAttribute: 'END', secondaryAttribute: 'STR' },
  { id: 'squat', label: 'Agachamentos', xpPerUnit: 3, unit: 'reps', icon: 'ArrowBigUp', category: 'fitness', primaryAttribute: 'STR', secondaryAttribute: 'END' },
  { id: 'water', label: 'Hidratação', xpPerUnit: 10, unit: 'copos (250ml)', icon: 'Droplets', category: 'health' },
  { id: 'sleep', label: 'Registrar Sono', xpPerUnit: 50, unit: 'noite', icon: 'Moon', category: 'health' },
  { id: 'bike', label: 'Ciclismo', xpPerUnit: 20, unit: 'km', icon: 'Bike', category: 'fitness', primaryAttribute: 'VIG', secondaryAttribute: 'STR' },
  { id: 'gym', label: 'Musculação / Peso', xpPerUnit: 10, unit: 'série', icon: 'Biceps', category: 'fitness' },
  { id: 'hiit', label: 'HIIT / Cardio Intenso', xpPerUnit: 8, unit: 'min', icon: 'Flame', category: 'fitness', primaryAttribute: 'AGI', secondaryAttribute: 'VIG' },
  { id: 'resistence', label: 'Treino de Resistência', xpPerUnit: 5, unit: 'min', icon: 'Shield', category: 'fitness', primaryAttribute: 'END', secondaryAttribute: 'VIG' },
  { id: 'fight', label: 'Treino de Luta/Boxe', xpPerUnit: 10, unit: 'min', icon: 'Swords', category: 'combat', primaryAttribute: 'STR', secondaryAttribute: 'DEX' },
  { id: 'sword', label: 'Esgrima / Bastão', xpPerUnit: 10, unit: 'min', icon: 'Sword', category: 'combat', primaryAttribute: 'DEX', secondaryAttribute: 'AGI' },
  { id: 'archery', label: 'Arco e Flecha', xpPerUnit: 40, unit: 'sessão', icon: 'Crosshair', category: 'combat', primaryAttribute: 'DEX', secondaryAttribute: 'STR' },
  { id: 'shooting', label: 'Treino de Mira / Tiro', xpPerUnit: 20, unit: 'sessão', icon: 'Target', category: 'combat', primaryAttribute: 'DEX', secondaryAttribute: 'INT' },
  { id: 'knife_throw', label: 'Arremesso de Faca', xpPerUnit: 25, unit: 'sessão', icon: 'MoveDiagonal', category: 'combat', primaryAttribute: 'DEX', secondaryAttribute: 'AGI' },
  { id: 'study', label: 'Estudo / Leitura', xpPerUnit: 5, unit: 'pág/min', icon: 'BookOpen', category: 'intellect', primaryAttribute: 'INT' },
  { id: 'drive', label: 'Dirigir', xpPerUnit: 2, unit: 'km', icon: 'Car', category: 'intellect', primaryAttribute: 'DRV', secondaryAttribute: 'DEX' },
  { id: 'volunteer', label: 'Boa Ação / Ajuda', xpPerUnit: 150, unit: 'ação', icon: 'Heart', category: 'social', primaryAttribute: 'CHA', secondaryAttribute: 'INT' },
  { id: 'listen', label: 'Ouvir / Aconselhar', xpPerUnit: 10, unit: 'min', icon: 'Brain', category: 'social', primaryAttribute: 'CHA' },
  { id: 'smoke', label: 'Fumar Cigarro', xpPerUnit: 0, unit: 'cigarro', icon: 'Cigarette', category: 'bad_habit' },
  { id: 'alcohol', label: 'Ingerir Álcool', xpPerUnit: 0, unit: 'dose', icon: 'Beer', category: 'bad_habit' },
  { id: 'junk_food', label: 'Comer Besteira', xpPerUnit: 0, unit: 'refeição', icon: 'Pizza', category: 'bad_habit' },
];