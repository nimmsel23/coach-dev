import { createRoot } from 'react-dom/client';
import './styles.css';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';
import LocalCoachApp from './local/LocalCoachApp.jsx';
createRoot(document.getElementById('root')).render(<ErrorBoundary><LocalCoachApp /></ErrorBoundary>);
