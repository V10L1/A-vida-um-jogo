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
  relatedClass?: string; // Classe que ganha pontos com isso
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

// Lista expandida para cobrir as classes solicitadas
export const ACTIVITIES: ActivityType[] = [
  // --- Atividades Básicas (Sem Classe) ---
  { id: 'walk', label: 'Caminhada', xpPerUnit: 15, unit: 'km', icon: 'Footprints', category: 'fitness' },
  { id: 'pushup', label: 'Flexões', xpPerUnit: 2, unit: 'reps', icon: 'Dumbbell', category: 'fitness' },
  { id: 'water', label: 'Beber Água', xpPerUnit: 10, unit: 'copos (250ml)', icon: 'Droplets', category: 'health' },

  // --- Atividades de Classe ---
  { id: 'run', label: 'Corrida', xpPerUnit: 25, unit: 'km', icon: 'Wind', category: 'fitness', relatedClass: 'Corredor' },
  { id: 'bike', label: 'Ciclismo', xpPerUnit: 20, unit: 'km', icon: 'Bike', category: 'fitness', relatedClass: 'Biker' },
  { id: 'fight', label: 'Artes Marciais', xpPerUnit: 5, unit: 'min', icon: 'Swords', category: 'combat', relatedClass: 'Lutador' },
  { id: 'core', label: 'Treino de Core/Resistência', xpPerUnit: 3, unit: 'min', icon: 'Shield', category: 'fitness', relatedClass: 'Tanque' },
  { id: 'hiit', label: 'HIIT / Crossfit', xpPerUnit: 6, unit: 'min', icon: 'Flame', category: 'fitness', relatedClass: 'Berseker' },
  { id: 'gym', label: 'Musculação (Pesos)', xpPerUnit: 50, unit: 'treino', icon: 'Biceps', category: 'fitness', relatedClass: 'Bodybuilder' },
  { id: 'fencing', label: 'Esgrima / Kendo', xpPerUnit: 5, unit: 'min', icon: 'Sword', category: 'combat', relatedClass: 'Espadachim' },
  { id: 'volunteer', label: 'Voluntariado / Ajuda', xpPerUnit: 100, unit: 'ação', icon: 'Heart', category: 'social', relatedClass: 'Healer' },
  { id: 'archery', label: 'Tiro ao Alvo / Arco', xpPerUnit: 30, unit: 'sessão', icon: 'Crosshair', category: 'combat', relatedClass: 'Atirador' },
  { id: 'reflex', label: 'Treino de Reflexo / FPS', xpPerUnit: 15, unit: 'sessão', icon: 'Target', category: 'combat', relatedClass: 'Pistoleiro' },
  { id: 'meditate', label: 'Meditação / Aconselhamento', xpPerUnit: 2, unit: 'minutos', icon: 'Brain', category: 'health', relatedClass: 'Conselheiro' },
  { id: 'read', label: 'Leitura / Estudo', xpPerUnit: 5, unit: 'páginas', icon: 'BookOpen', category: 'intellect', relatedClass: 'Mago' },
];