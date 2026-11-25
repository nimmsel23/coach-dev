import { createRoot } from 'react-dom/client';
import SourceEditor from './SourceEditor.jsx';
import { fixtureState } from '../Coach/insights.browser-db.js';
import '../../styles.css';
import '../../components/exercise-inspector.css';
fixtureState.sourceApi = 'http://127.0.0.1:15930';
createRoot(document.getElementById('root')).render(<main className="ei-dialog p-5 mx-auto max-w-3xl" style={{overflow:'auto',height:'100vh'}}><SourceEditor id="inbox_test" initiallyOpen exercise={{display_name:'Klimmzug',wger_id:1}} candidates={{wger:{id:'999',display_name:'Falscher Vorschlag'}}} onSaved={value=>{window.savedSourceMerge=value;}} /></main>);
