import React from 'react';
import { 
  Footprints, 
  Dumbbell, 
  Droplets, 
  BookOpen, 
  Brain, 
  Zap,
  Trophy,
  User,
  Activity,
  ChevronRight,
  Plus,
  Moon,
  Clock,
  Wind,
  Bike,
  Swords,
  Shield,
  Flame,
  BicepsFlexed,
  Sword,
  Heart,
  Crosshair,
  Target,
  Users,
  Star,
  Pencil,
  Save,
  X
} from 'lucide-react';

export const getIcon = (name: string, className?: string) => {
  const props = { className: className || "w-6 h-6" };
  switch (name) {
    case 'Footprints': return <Footprints {...props} />;
    case 'Dumbbell': return <Dumbbell {...props} />;
    case 'Droplets': return <Droplets {...props} />;
    case 'BookOpen': return <BookOpen {...props} />;
    case 'Brain': return <Brain {...props} />;
    case 'Zap': return <Zap {...props} />;
    case 'Trophy': return <Trophy {...props} />;
    case 'User': return <User {...props} />;
    case 'Activity': return <Activity {...props} />;
    case 'ChevronRight': return <ChevronRight {...props} />;
    case 'Plus': return <Plus {...props} />;
    case 'Moon': return <Moon {...props} />;
    case 'Clock': return <Clock {...props} />;
    
    // Class Icons
    case 'Wind': return <Wind {...props} />;
    case 'Bike': return <Bike {...props} />;
    case 'Swords': return <Swords {...props} />;
    case 'Shield': return <Shield {...props} />;
    case 'Flame': return <Flame {...props} />;
    case 'Biceps': return <BicepsFlexed {...props} />;
    case 'Sword': return <Sword {...props} />;
    case 'Heart': return <Heart {...props} />;
    case 'Crosshair': return <Crosshair {...props} />;
    case 'Target': return <Target {...props} />;
    case 'Users': return <Users {...props} />;
    case 'Star': return <Star {...props} />;

    // UI Actions
    case 'Pencil': return <Pencil {...props} />;
    case 'Save': return <Save {...props} />;
    case 'X': return <X {...props} />;
    
    default: return <Activity {...props} />;
  }
};