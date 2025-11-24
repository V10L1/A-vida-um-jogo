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
  Plus
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
    default: return <Activity {...props} />;
  }
};