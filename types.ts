export type Gender = 'Masculino' | 'Feminino' | 'Outros';

export interface UserProfile {
  name: string;
  dob: string;
  weight: number;
  height: number;
  gender: Gender;
  profession: string;
}

export interface ActivityType {
  id: string;
  label: string;
  xpPerUnit: number;
  unit: string;
  icon: string;
  category: 'fitness' | 'intellect' | 'health' | 'combat' | 'social';
  relatedClass?: string; // Classe que ganha pontos com isso. Se undefined, é atividade básica.
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
  classPoints: Record<string, number>; // Pontos acumulados por classe
  activeBuff?: XpBuff | null;
}

// Lista de Classes Oficiais para o Gráfico
export const RPG_CLASSES = [
  'Corredor', 'Biker', 'Lutador', 'Tanque', 
  'Berseker', 'Bodybuilder', 'Espadachim', 'Healer', 
  'Atirador', 'Pistoleiro', 'Conselheiro', 'Mago'
];

export const ACTIVITIES: ActivityType[] = [
  // --- Atividades Básicas (Sem Classe) ---
  { id: 'walk', label: 'Caminhada Leve', xpPerUnit: 15, unit: 'km', icon: 'Footprints', category: 'fitness' },
  { id: 'pushup', label: 'Flexões Diárias', xpPerUnit: 2, unit: 'reps', icon: 'Dumbbell', category: 'fitness' },
  { id: 'water', label: 'Hidratação', xpPerUnit: 10, unit: 'copos', icon: 'Droplets', category: 'health' },

  // --- Atividades Principais / Classes ---
  
  // Fitness / Força
  { id: 'run', label: 'Corrida', xpPerUnit: 30, unit: 'km', icon: 'Wind', category: 'fitness', relatedClass: 'Corredor' },
  { id: 'bike', label: 'Ciclismo', xpPerUnit: 20, unit: 'km', icon: 'Bike', category: 'fitness', relatedClass: 'Biker' },
  { id: 'gym', label: 'Musculação / Peso', xpPerUnit: 50, unit: 'treino', icon: 'Biceps', category: 'fitness', relatedClass: 'Bodybuilder' },
  { id: 'hiit', label: 'HIIT / Cardio Intenso', xpPerUnit: 8, unit: 'min', icon: 'Flame', category: 'fitness', relatedClass: 'Berseker' },
  { id: 'resistence', label: 'Treino de Resistência', xpPerUnit: 5, unit: 'min', icon: 'Shield', category: 'fitness', relatedClass: 'Tanque' },

  // Combate / Destreza
  { id: 'fight', label: 'Treino de Luta/Boxe', xpPerUnit: 10, unit: 'min', icon: 'Swords', category: 'combat', relatedClass: 'Lutador' },
  { id: 'sword', label: 'Esgrima / Bastão', xpPerUnit: 10, unit: 'min', icon: 'Sword', category: 'combat', relatedClass: 'Espadachim' },
  { id: 'archery', label: 'Arco e Flecha', xpPerUnit: 40, unit: 'sessão', icon: 'Crosshair', category: 'combat', relatedClass: 'Atirador' },
  { id: 'shooting', label: 'Treino de Mira / Tiro', xpPerUnit: 20, unit: 'sessão', icon: 'Target', category: 'combat', relatedClass: 'Pistoleiro' },

  // Intelecto / Social / Suporte
  { id: 'study', label: 'Estudo / Leitura', xpPerUnit: 5, unit: 'pág/min', icon: 'BookOpen', category: 'intellect', relatedClass: 'Mago' },
  { id: 'volunteer', label: 'Boa Ação / Ajuda', xpPerUnit: 150, unit: 'ação', icon: 'Heart', category: 'social', relatedClass: 'Healer' },
  { id: 'listen', label: 'Ouvir / Aconselhar', xpPerUnit: 10, unit: 'min', icon: 'Brain', category: 'social', relatedClass: 'Conselheiro' },
];