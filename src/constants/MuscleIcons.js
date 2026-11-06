import { 
  Zap, 
  Dumbbell, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  User, 
  Activity, 
  Target,
  Circle,
  Trophy,
  Shield,
  Focus
} from "lucide-react";

export const MUSCLE_ICONS = {
  chest:      Shield,
  back:       ArrowUpCircle,
  shoulders:  Zap,
  arms:       Dumbbell,
  core:       Target,
  glutes:     Activity,
  quadriceps: ArrowDownCircle,
  hamstrings: Circle,
  calves:     Focus,
  legs:       Trophy,
  // Numeric fallback
  "100_chest": Shield,
  "200_back":  ArrowUpCircle,
  "300_shoulders": Zap,
  "400_arms":  Dumbbell,
  "500_core":  Target,
  "600_legs":  Trophy,
  "700_calves": Focus,
  // Die 16 spezifischen KB-Regionen (siehe Muscles/index.jsx MUSCLE_GROUPS) —
  // fallen ohne diese Einträge auf den generischen Activity-Default zurück.
  upper_back: ArrowUpCircle,
  middle_back: ArrowUpCircle,
  lower_back: ArrowUpCircle,
  rhomboids: ArrowUpCircle,
  serratus_anterior: Shield,
  biceps: Dumbbell,
  triceps: Dumbbell,
  forearms: Dumbbell,
  abs: Target,
  abductors: Activity,
  adductors: Activity,
};

export function getMuscleIcon(muscleId) {
  const m = String(muscleId || "").toLowerCase();
  if (MUSCLE_ICONS[m]) return MUSCLE_ICONS[m];
  
  // Prefix fallback
  const p = m.match(/^(\d+)_/);
  if (p) {
    const n = p[1];
    if (MUSCLE_ICONS[`${n.charAt(0)}00_${m.split('_')[1]}`]) return MUSCLE_ICONS[`${n.charAt(0)}00_${m.split('_')[1]}`];
    if (n.startsWith('1')) return MUSCLE_ICONS.chest;
    if (n.startsWith('2')) return MUSCLE_ICONS.back;
    if (n.startsWith('3')) return MUSCLE_ICONS.shoulders;
    if (n.startsWith('4')) return MUSCLE_ICONS.arms;
    if (n.startsWith('5')) return MUSCLE_ICONS.core;
    if (n.startsWith('6')) return MUSCLE_ICONS.legs;
    if (n.startsWith('7')) return MUSCLE_ICONS.calves;
  }
  
  return Activity; // Default
}
