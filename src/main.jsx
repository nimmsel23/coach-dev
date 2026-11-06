import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import '@src/styles.css'
import { UserProvider } from './contexts/UserContext.jsx'
import { SettingsProvider } from './contexts/SettingsContext.jsx'

createRoot(document.getElementById('root')).render(
  <UserProvider>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </UserProvider>
)
