import { Dumbbell, Layers, MessageSquare, Flame, RotateCw, Sparkles } from 'lucide-react'

/** Primäre Klienten-Bereiche — in Sidebar + Bottom-Nav SubTabs. */
export const CLIENT_PRIMARY_TABS = [
  { id: 'workouts', label: 'Verlauf', icon: Dumbbell },
  { id: 'trainingplan', label: 'Plan', icon: Layers },
  { id: 'messages', label: 'Chat', icon: MessageSquare },
]

/** Sekundäre Bereiche — „Mehr“ in Panel / Submenu. */
export const CLIENT_MORE_TABS = [
  { id: 'sixpack', label: '6Pack', icon: Flame },
  { id: 'habits', label: 'Habits', icon: RotateCw },
  { id: 'insights', label: 'KI-Insights', icon: Sparkles },
  { id: 'plan', label: 'Rotation (alt)', icon: Layers },
]

export const CLIENT_ALL_TABS = [...CLIENT_PRIMARY_TABS, ...CLIENT_MORE_TABS]

export const CLIENT_MORE_IDS = new Set(CLIENT_MORE_TABS.map((tab) => tab.id))
