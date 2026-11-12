import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server;
let CoachShell;
const modules = {
  '../contexts/UserContext.jsx': `export const useUser = () => globalThis.coachUnreadWiringFixture.auth;`,
  '../store/index.js': `export const useSettingsStore = () => ({sidebarPinned:false});`,
  '../hooks/useCoachAccess.js': `export const useCoachAccess = () => globalThis.coachUnreadWiringFixture.allowed;`,
  '../views/Coach/useCoachUnreadCounts.js': `export function useCoachUnreadCounts(actor) {
    const fixture = globalThis.coachUnreadWiringFixture;
    fixture.actors.push(actor);
    return actor ? fixture.unread : {byClient:{},unreadClients:[],total:0,error:false};
  }`,
  './useCoachUnreadCounts.js': `export function useCoachUnreadCounts() { throw new Error('Coach must consume shell unread state'); }`,
  '../views/Coach/useCoachRoute.js': `export const useCoachRoute = () => [{sub:'clients',client:''}, () => {}];`,
  '../lib/kb/muscles.js': `export const getStaticMuscleTaxonomy = () => [];`,
  '@db': `export const watchCoachInbox = () => () => {};`,
  '../Inbox/useInbox': `export const useInbox = () => ({exercises:[],mergeCandidates:{},loading:false});`,
  './ClientsPanel': `import {createElement} from 'react'; export default function ClientsPanel({unreadCounts}) {
    return createElement('output', {'data-area':'clients'}, JSON.stringify(unreadCounts));
  }`,
};
const nullViews = new Set([
  '../components/ExerciseInsightModal.jsx', '../components/AuthGateModal.jsx',
  './CoachHeader.jsx', './WorkerChip.jsx', './ThemeSheet.jsx',
  '../Inbox/InboxCard', './CatalogBrowser', './TractionPanel.jsx',
]);

before(async () => {
  server = await createServer({
    configFile: false,
    optimizeDeps: {noDiscovery:true},
    server: {middlewareMode: true},
    esbuild: {jsx: 'automatic'},
    plugins: [{
      name: 'unread-wiring-fixture',
      enforce: 'pre',
      resolveId(source, importer) {
        if (!importer?.endsWith('/CoachShell.jsx') && !importer?.endsWith('/Coach/index.jsx')) return;
        if (source in modules || nullViews.has(source) || ['./CoachSidebar.jsx', './CoachTabBar.jsx', '../components/common/ErrorBoundary.jsx'].includes(source)) return `\0unread-fixture:${source}`;
      },
      load(id) {
        if (!id.startsWith('\0unread-fixture:')) return;
        const source = id.slice('\0unread-fixture:'.length);
        if (source in modules) return modules[source];
        if (source === '../components/common/ErrorBoundary.jsx') return `export default function Boundary({children}) {return children;}`;
        if (source === './CoachSidebar.jsx' || source === './CoachTabBar.jsx') return `import {createElement} from 'react'; export default function Navigation({counts}) {return createElement('output', {'data-area':'${source}'}, counts.clients);}`;
        return 'export default function View() {return null;}';
      },
    }],
  });
  CoachShell = (await server.ssrLoadModule('/src/shell/CoachShell.jsx')).default;
});
after(async () => { await server?.close(); delete globalThis.coachUnreadWiringFixture; });

function render({allowed = true, authLoading = false, unreadError = false} = {}) {
  globalThis.coachUnreadWiringFixture = {
    auth: {user: {uid:'approved-coach'}, authLoading}, allowed, actors: [],
    unread: {byClient: {alice:3,bob:1}, unreadClients:[], total:4, error:unreadError},
  };
  return renderToStaticMarkup(createElement(CoachShell));
}

test('one approved unread source reaches both navigation badges and the actual Coach client list', () => {
  const html = render();
  assert.deepEqual(globalThis.coachUnreadWiringFixture.actors, ['approved-coach']);
  assert.match(html, /data-area="\.\/CoachSidebar.jsx">4<\/output>/);
  assert.match(html, /data-area="\.\/CoachTabBar.jsx">4<\/output>/);
  assert.match(html, /data-area="clients">\{&quot;alice&quot;:3,&quot;bob&quot;:1\}<\/output>/);
});

test('shared unread failures reach the actual Coach status notice', () => {
  assert.match(render({unreadError:true}), /Ungelesen-Status ist derzeit nicht verfügbar/);
});

test('pending authentication and denied access never pass an actor or render client data', () => {
  for (const options of [{authLoading:true}, {allowed:false}]) {
    const html = render(options);
    assert.deepEqual(globalThis.coachUnreadWiringFixture.actors, [null]);
    assert.doesNotMatch(html, /data-area="clients"/);
  }
});
