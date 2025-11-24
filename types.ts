export interface UserProfile {
  name: string;
  dob: string;
  weight: number;
  height: number;
}

export interface ActivityType {
  id: string;
  label: string;
  xpPerUnit: number;
  unit: string;
  icon: string;
  category: 'fitness' | 'intellect' | 'health';
}

export interface ActivityLog {
  id: string;
  activityId: string;
  amount: number;
  xpGained: number;
  timestamp: number;
}

export interface GameState {
  level: number;
  currentXp: number;
  totalXp: number;
  logs: ActivityLog[];
  classTitle: string; // e.g., "Novato", "Guerreiro", "Mestre"
}

export const ACTIVITIES: ActivityType[] = [
  { id: 'walk', label: 'Caminhada', xpPerUnit: 15, unit: 'km', icon: 'Footprints', category: 'fitness' },
  { id: 'pushup', label: 'Flexões', xpPerUnit: 2, unit: 'reps', icon: 'Dumbbell', category: 'fitness' },
  { id: 'water', label: 'Beber Água', xpPerUnit: 10, unit: 'copos (250ml)', icon: 'Droplets', category: 'health' },
  { id: 'read', label: 'Leitura', xpPerUnit: 5, unit: 'páginas', icon: 'BookOpen', category: 'intellect' },
  { id: 'meditate', label: 'Meditação', xpPerUnit: 2, unit: 'minutos', icon: 'Brain', category: 'health' },
  { id: 'run', label: 'Corrida', xpPerUnit: 25, unit: 'km', icon: 'Zap', category: 'fitness' },
];