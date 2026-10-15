import { createRoot } from 'react-dom/client'
import '@src/styles.css'
import { UserProvider } from './contexts/UserContext.jsx'
import { SettingsProvider } from './contexts/SettingsContext.jsx'
import CoachShell from './shell/CoachShell.jsx'

createRoot(document.getElementById('root')).render(
  <UserProvider>
    <SettingsProvider>
      <CoachShell />
    </SettingsProvider>
  </UserProvider>
)
