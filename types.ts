
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
export type Attribute = 'STR' | 'END' | 'AGI' | 'DEX' | 'INT' | 'CHA';

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
}

export interface XpBuff {
  multiplier: number; // ex: 1.16 para +16%
  expiresAt: number; // Timestamp de quando acaba
  description: string;
}

export interface GameState {
  level: number;
  currentXp: number;
  totalXp: number;
  logs: ActivityLog[];
  classTitle: string; 
  attributes: Record<Attribute, number>; // Pontos de Atributo (Força, Agilidade, etc)
  activeBuff?: XpBuff | null;
}

// Lista de Classes para Display (Lógica é calculada dinamicamente)
export const RPG_CLASSES = [
  'Corredor', 'Biker', 'Lutador', 'Tanque', 
  'Berseker', 'Bodybuilder', 'Espadachim', 'Healer', 
  'Atirador', 'Pistoleiro', 'Conselheiro', 'Mago', 'NPC'
];

export const ATTRIBUTE_LABELS: Record<Attribute, string> = {
    STR: 'Força',
    END: 'Resistência',
    AGI: 'Agilidade',
    DEX: 'Destreza',
    INT: 'Intelecto',
    CHA: 'Carisma'
};

export const ACTIVITIES: ActivityType[] = [
  // --- Atividades Básicas (Dão pouco atributo, foco em XP geral) ---
  { id: 'walk', label: 'Caminhada Leve', xpPerUnit: 15, unit: 'km', icon: 'Footprints', category: 'fitness', primaryAttribute: 'END' },
  { id: 'pushup', label: 'Flexões Diárias', xpPerUnit: 2, unit: 'reps', icon: 'Dumbbell', category: 'fitness', primaryAttribute: 'STR' },
  { id: 'water', label: 'Hidratação', xpPerUnit: 10, unit: 'copos', icon: 'Droplets', category: 'health', primaryAttribute: 'END' },

  // --- Atividades Principais (Físico) ---
  { id: 'run', label: 'Corrida', xpPerUnit: 30, unit: 'km', icon: 'Wind', category: 'fitness', primaryAttribute: 'END', secondaryAttribute: 'AGI' },
  { id: 'bike', label: 'Ciclismo', xpPerUnit: 20, unit: 'km', icon: 'Bike', category: 'fitness', primaryAttribute: 'END', secondaryAttribute: 'STR' },
  { id: 'gym', label: 'Musculação / Peso', xpPerUnit: 50, unit: 'treino', icon: 'Biceps', category: 'fitness', primaryAttribute: 'STR' },
  { id: 'hiit', label: 'HIIT / Cardio Intenso', xpPerUnit: 8, unit: 'min', icon: 'Flame', category: 'fitness', primaryAttribute: 'AGI', secondaryAttribute: 'END' },
  { id: 'resistence', label: 'Treino de Resistência', xpPerUnit: 5, unit: 'min', icon: 'Shield', category: 'fitness', primaryAttribute: 'END', secondaryAttribute: 'STR' },

  // --- Combate ---
  { id: 'fight', label: 'Treino de Luta/Boxe', xpPerUnit: 10, unit: 'min', icon: 'Swords', category: 'combat', primaryAttribute: 'STR', secondaryAttribute: 'DEX' },
  { id: 'sword', label: 'Esgrima / Bastão', xpPerUnit: 10, unit: 'min', icon: 'Sword', category: 'combat', primaryAttribute: 'DEX', secondaryAttribute: 'AGI' },
  { id: 'archery', label: 'Arco e Flecha', xpPerUnit: 40, unit: 'sessão', icon: 'Crosshair', category: 'combat', primaryAttribute: 'DEX' },
  { id: 'shooting', label: 'Treino de Mira / Tiro', xpPerUnit: 20, unit: 'sessão', icon: 'Target', category: 'combat', primaryAttribute: 'DEX', secondaryAttribute: 'INT' },

  // --- Intelectual / Social ---
  { id: 'study', label: 'Estudo / Leitura', xpPerUnit: 5, unit: 'pág/min', icon: 'BookOpen', category: 'intellect', primaryAttribute: 'INT' },
  { id: 'volunteer', label: 'Boa Ação / Ajuda', xpPerUnit: 150, unit: 'ação', icon: 'Heart', category: 'social', primaryAttribute: 'CHA', secondaryAttribute: 'INT' },
  { id: 'listen', label: 'Ouvir / Aconselhar', xpPerUnit: 10, unit: 'min', icon: 'Brain', category: 'social', primaryAttribute: 'CHA' },
];
