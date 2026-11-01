import { createRoot } from 'react-dom/client';
import './styles.css';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';
import LocalCoachApp from './local/LocalCoachApp.jsx';
createRoot(document.getElementById('root')).render(<ErrorBoundary><LocalCoachApp /></ErrorBoundary>);

// An old catalog worker may control this origin. Replace only that obsolete root worker.
if ('serviceWorker' in navigator && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
  navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.filter((registration) => {
    const worker = registration.active || registration.waiting || registration.installing;
    return worker && new URL(worker.scriptURL).pathname === '/sw.js';
  }).map((registration) => registration.update()))).catch(() => {});
}
