

export type Gender = 'Masculino' | 'Feminino' | 'Outros';

export interface UserProfile {
  name: string;
  dob: string;
  weight: number;
  height: number;
  gender: Gender;
  profession: string;
  avatarImage?: string; // Base64 string da imagem customizada
}

// Novos Atributos de RPG
// STR: Força Bruta (Low Reps)
// END: Resistência Muscular (High Reps)
// VIG: Fôlego/Cardio (Novo)
// AGI: Velocidade
// DEX: Coordenação
// INT: Mente
// CHA: Social
// DRV: Direção
export type Attribute = 'STR' | 'END' | 'VIG' | 'AGI' | 'DEX' | 'INT' | 'CHA' | 'DRV';

export interface ActivityType {
  id: string;
  label: string;
  xpPerUnit: number;
  unit: string;
  icon: string;
  category: 'fitness' | 'intellect' | 'health' | 'combat' | 'social';
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
  // Detalhes opcionais para treinos complexos (Musculação e Corrida)
  details?: {
    exercise?: string;
    weight?: number;
    reps?: number;
    restTime?: number;
    distance?: number; // km
    duration?: string; // MM:SS
    pace?: string; // MM:SS /km
  };
}

export interface XpBuff {
  multiplier: number; // ex: 1.16 para +16%
  expiresAt: number; // Timestamp de quando acaba
  description: string;
}

export interface Quest {
  id: string;
  type: 'daily' | 'weekly';
  activityId: string; // Qual atividade precisa ser feita
  targetAmount: number; // Meta (ex: 5km, 100 flexoes)
  currentAmount: number; // Progresso atual
  xpReward: number; // Recompensa em XP
  isClaimed: boolean; // Se ja pegou o premio
  createdAt: number; // Para saber quando expira
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
    type: 'text' | 'system'; // System para avisos de Boss/Level Up
}

export interface Boss {
    currentHp: number;
    maxHp: number;
    level: number;
    name: string; // ex: "Dragão da Preguiça", "Golem de Sedentarismo"
    image: string; // Emoji ou URL
}

export interface Guild {
    id: string;
    name: string;
    description: string;
    level: number;
    members: Record<string, GuildMember>; // Mapa de UID -> Member
    xp: number; // XP da guilda para subir de nivel
    boss?: Boss;
}

export interface GameState {
  level: number;
  currentXp: number;
  totalXp: number;
  logs: ActivityLog[];
  classTitle: string; 
  attributes: Record<Attribute, number>; // Pontos de Atributo (Força, Agilidade, etc)
  activeBuff?: XpBuff | null;
  quests: Quest[]; // Lista de missoes ativas
  lastDailyQuestGen?: number; // Data da ultima geracao diaria
  lastWeeklyQuestGen?: number; // Data da ultima geracao semanal
  guildId?: string | null; // ID da guilda se tiver
}

// Lista de Classes para Display (Lógica é calculada dinamicamente)
export const RPG_CLASSES = [
  'Corredor', 'Biker', 'Lutador', 'Tanque', 
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

// IDs das atividades básicas para lógica de Quests
export const BASIC_ACTIVITY_IDS = ['walk', 'run', 'pushup', 'abs', 'water'];

export const ACTIVITIES: ActivityType[] = [
  // --- Atividades Básicas (Missões Diárias Padrão) ---
  // Cardio agora vai para VIG (Vigor) em vez de END
  { id: 'walk', label: 'Caminhada Leve', xpPerUnit: 15, unit: 'km', icon: 'Footprints', category: 'fitness', primaryAttribute: 'VIG' },
  { id: 'run', label: 'Corrida', xpPerUnit: 30, unit: 'km', icon: 'Wind', category: 'fitness', primaryAttribute: 'VIG', secondaryAttribute: 'AGI' },
  
  // Calistenia (High Reps) -> Foco em END (Resistência Muscular)
  { id: 'pushup', label: 'Flexões', xpPerUnit: 2, unit: 'reps', icon: 'Dumbbell', category: 'fitness', primaryAttribute: 'STR', secondaryAttribute: 'END' },
  { id: 'abs', label: 'Abdominais', xpPerUnit: 2, unit: 'reps', icon: 'ArrowBigUp', category: 'fitness', primaryAttribute: 'END', secondaryAttribute: 'STR' },
  { id: 'squat', label: 'Agachamentos', xpPerUnit: 3, unit: 'reps', icon: 'ArrowBigUp', category: 'fitness', primaryAttribute: 'STR', secondaryAttribute: 'END' },
  
  // Hidratacao nao da pontos de atributo, apenas XP geral
  { id: 'water', label: 'Hidratação', xpPerUnit: 10, unit: 'copos (250ml)', icon: 'Droplets', category: 'health' },

  // --- Atividades Específicas / Classe ---
  { id: 'bike', label: 'Ciclismo', xpPerUnit: 20, unit: 'km', icon: 'Bike', category: 'fitness', primaryAttribute: 'VIG', secondaryAttribute: 'STR' },
  
  // Gym xpPerUnit é base, mas será calculado dinamicamente pelo peso x reps
  // Atributos definidos dinamicamente no App.tsx
  { id: 'gym', label: 'Musculação / Peso', xpPerUnit: 10, unit: 'série', icon: 'Biceps', category: 'fitness' },
  
  { id: 'hiit', label: 'HIIT / Cardio Intenso', xpPerUnit: 8, unit: 'min', icon: 'Flame', category: 'fitness', primaryAttribute: 'AGI', secondaryAttribute: 'VIG' },
  { id: 'resistence', label: 'Treino de Resistência', xpPerUnit: 5, unit: 'min', icon: 'Shield', category: 'fitness', primaryAttribute: 'END', secondaryAttribute: 'VIG' },

  // --- Combate ---
  { id: 'fight', label: 'Treino de Luta/Boxe', xpPerUnit: 10, unit: 'min', icon: 'Swords', category: 'combat', primaryAttribute: 'STR', secondaryAttribute: 'DEX' },
  { id: 'sword', label: 'Esgrima / Bastão', xpPerUnit: 10, unit: 'min', icon: 'Sword', category: 'combat', primaryAttribute: 'DEX', secondaryAttribute: 'AGI' },
  { id: 'archery', label: 'Arco e Flecha', xpPerUnit: 40, unit: 'sessão', icon: 'Crosshair', category: 'combat', primaryAttribute: 'DEX' },
  { id: 'shooting', label: 'Treino de Mira / Tiro', xpPerUnit: 20, unit: 'sessão', icon: 'Target', category: 'combat', primaryAttribute: 'DEX', secondaryAttribute: 'INT' },

  // --- Intelectual / Social / Outros ---
  { id: 'study', label: 'Estudo / Leitura', xpPerUnit: 5, unit: 'pág/min', icon: 'BookOpen', category: 'intellect', primaryAttribute: 'INT' },
  { id: 'drive', label: 'Dirigir', xpPerUnit: 2, unit: 'km', icon: 'Car', category: 'intellect', primaryAttribute: 'DRV', secondaryAttribute: 'DEX' },
  { id: 'volunteer', label: 'Boa Ação / Ajuda', xpPerUnit: 150, unit: 'ação', icon: 'Heart', category: 'social', primaryAttribute: 'CHA', secondaryAttribute: 'INT' },
  { id: 'listen', label: 'Ouvir / Aconselhar', xpPerUnit: 10, unit: 'min', icon: 'Brain', category: 'social', primaryAttribute: 'CHA' },
];