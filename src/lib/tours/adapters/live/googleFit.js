// Google Fit REST API — https://developers.google.com/fit/rest
// Bräuchte: OAuth-Client (Google Cloud Console) + fitness.activity.read Scope.
// Nicht konfiguriert (kein Client in ~/.env/), siehe liveAdapter.js.
import { makeLiveAdapter } from './liveAdapter.js';

export const googleFitAdapter = makeLiveAdapter({
  id: 'google_fit',
  label: 'Google Fit',
  docsUrl: 'https://developers.google.com/fit/rest',
  note: 'Braucht OAuth-Client-ID (Google Cloud Console) + Scope fitness.activity.read.',
});
