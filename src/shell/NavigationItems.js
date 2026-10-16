import { Inbox, LibraryBig, Users } from 'lucide-react'

// Coach-Bereiche — entsprechen den Sub-Tabs der Hash-Route (views/Coach/coachRoute.js).
// Geforkt aus ~/vitalos/src/shell/NavigationItems.js: gleiche Form ({ id, label, Icon }),
// damit Sidebar und Tab-Bar der Shell 1:1 weiterverwendet werden koennen.
export const NAV_ITEMS = [
  { id: 'exercises', label: 'Anfragen', title: 'Übungsanfragen', Icon: Inbox },
  { id: 'catalog',   label: 'Katalog',  title: 'Katalog',        Icon: LibraryBig },
  { id: 'clients',   label: 'Klienten', title: 'Klienten',       Icon: Users },
]

export function findNavItem(id) {
  return NAV_ITEMS.find((item) => item.id === id) || NAV_ITEMS[0]
}
