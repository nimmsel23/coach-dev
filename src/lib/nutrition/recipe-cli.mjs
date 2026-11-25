// Recipe CLI: profile validation, generation, JSON output and global Fuel SQLite backup.
// node src/lib/nutrition/recipe-cli.mjs --input /tmp/profile.json [--week | --day 1] [--meal 1] [--replay raw.json] --output /tmp/recipes.json
import { readFile, writeFile as writeRaw, rename, unlink, realpath } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { recipeBudget, planRecipeSlots } from './profile.js';
import { calculateNutritionTargets } from './targets.js';
import { buildRecipePrompt, validateRecipeRun, runRecipeSlots, RECIPE_DAYS, extractNutritionPreferences } from './recipeRuns.js';

async function writeFile(path, content) {
  const temporary = `${path}.tmp-${process.pid}`;
  try { await writeRaw(temporary, content, { flag: 'wx' }); await rename(temporary, path); }
  finally { await unlink(temporary).catch(() => {}); }
}
const macros = (value) => `${value.kcal} kcal | ${value.protein} g Protein | ${value.fat} g Fett | ${value.carbs} g KH`;
const args = process.argv.slice(2);
const flag = (name) => args[args.indexOf(name) + 1];
const switches=new Set(['--week','--check','--catalog-list','--catalog-backup','--no-catalog','--json','--help']);
const options=new Set(['--input','--output','--context','--client','--meal','--day','--replay','--provider','--catalog-db','--query']);
const usage=`Ernährungs-CLI
  --input profil.json --check [--output pruefung.json]     Anforderungen prüfen, 0 KI-Aufrufe
  --input profil.json --output plan.json [--week|--day 1] [--meal 1]
  --catalog-list [--query Hendl] [--json]                  Globalen SQLite-Katalog durchsuchen
  --context FUEL.md | --client lokale-id                 Regeln nur lesen
  --replay antworten.raw.json                            Rohantworten ohne KI nachprüfen
  --catalog-db pfad.sqlite3                              Alternative/Test-Datenbank
  --no-catalog                                           Rezept-Backup deaktivieren
  --catalog-backup                                       Replay ausdrücklich im Katalog sichern
  --provider fitness.env                                 Vorhandene Fuel-Konfiguration wählen
Makros: bodyweight, ratio oder grams. Stile frei kombinierbar. Rhythmus: meals, omad, nomad.
Vollständige Beispiele: src/lib/nutrition/README.md`;
for(let i=0;i<args.length;i++){
  if(switches.has(args[i]))continue;
  if(options.has(args[i])&&args[i+1]&&!args[i+1].startsWith('--')){i++;continue;}
  console.error(`Ungültige Option oder fehlender Wert: ${args[i]}\n${usage}`);process.exit(2);
}
if(args.includes('--help')){console.log(usage);process.exit(0);}

function catalog(action,value={}) {
  const root=fileURLToPath(new URL('../../../',import.meta.url));
  const code=`import sys,json;sys.path.insert(0,sys.argv[1]);from src.fuel_recipe_catalog import save_recipe,list_recipes;v=json.load(sys.stdin);p=sys.argv[3] or None;print(json.dumps(save_recipe(v,p) if sys.argv[2]=='save' else list_recipes(v.get('q',''),p),ensure_ascii=False))`;
  const result=spawnSync('python3',['-c',code,root,action,args.includes('--catalog-db')?flag('--catalog-db'):''],{input:JSON.stringify(value),encoding:'utf8'});
  if(result.status!==0)throw new Error('Fuel-Rezeptkatalog konnte nicht gelesen/geschrieben werden.');
  return JSON.parse(result.stdout);
}
if(args.includes('--catalog-list')) {
  const values=catalog('list',{q:args.includes('--query')?flag('--query'):''});
  if(args.includes('--json'))console.log(JSON.stringify(values,null,2));
  else {console.log(`Globaler Fuel-Rezeptkatalog · ${values.length} Treffer · Nährwerte geschätzt`);console.table(values.map(v=>({ID:v.id.slice(0,12),Gericht:v.recipe.name.slice(0,65),Minuten:v.recipe.minutes,kcal:v.recipe.estimates?.kcal??'—',Sicherungen:v.seenCount})));}
  process.exit(0);
}

if (!args.includes('--input') || (!args.includes('--output')&&!args.includes('--check'))) {
  console.log(usage);
  process.exit(1);
}
if (args.includes('--output') && extname(flag('--output')) !== '.json') throw new Error('--output muss eine JSON-Datei sein.');
const outputPath = !args.includes('--output') ? null : await realpath(flag('--output')).catch(() => resolve(flag('--output')));
for (const name of ['--input', '--context']) if (args.includes(name) && outputPath === await realpath(flag(name))) throw new Error('Eingabe/FUEL.md darf nicht als Ausgabedatei überschrieben werden.');
let profile;
try{profile=JSON.parse(await readFile(flag('--input'),'utf8'));}
catch{console.error('Profildatei nicht lesbar oder kein gültiges JSON. 0 Gemini-Aufrufe.');process.exit(2);}
const input = profile.input || profile;
let context = args.includes('--context') ? await readFile(flag('--context'), 'utf8') : '';
if (args.includes('--client')) {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const code = `import sys,json;sys.path.insert(0,sys.argv[1]);from coach_local_plans import clients_root;from src.coach_nutrition_preferences import read_preferences;print(json.dumps(read_preferences(clients_root(),sys.argv[2])))`;
  const result = spawnSync('python3', ['-c', code, root, flag('--client')], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('FUEL.md des Klienten konnte nicht gelesen werden. Client-ID und lokale Ablage prüfen.');
  const workspace = JSON.parse(result.stdout);
  context = [workspace.context, context].filter(Boolean).join('\n');
  console.log(`Workspace-Vorgaben: ${workspace.source || 'keine FUEL.md/NUTRITION.md vorhanden'} (nur gelesen)`);
}
const preferences = extractNutritionPreferences(context);
let targets;
try { targets=calculateNutritionTargets(input); }
catch(error) {
  const report={ok:false,conflicts:[error.message],providerRequests:0};
  console.error(`PLANUNG NICHT AUSFÜHRBAR\n- ${error.message}\n0 Gemini-Aufrufe.`);
  if(args.includes('--output'))await writeFile(flag('--output'),JSON.stringify(report,null,2));
  process.exit(2);
}
if(args.includes('--check')) {
  console.log(`PLANPRÜFUNG · ${input.style||'freie Lebensmittelauswahl'}\n${targets.macroDescription}\nTagesziel: ${macros({kcal:targets.targetKcal,protein:targets.proteinG,fat:targets.fatG,carbs:targets.carbsG})}`);
  for(const day of targets.week)console.log(`${RECIPE_DAYS[day.day]}: ${day.rhythm} · ${day.mealTargets.length} ${day.mealTargets.length===1?'Mahlzeit':'Mahlzeiten'}${day.times.length?' · '+day.times.join(', '):''}${day.window?' · Fenster '+day.window.start+'–'+day.window.end:''}`);
  console.log(`Alltag: ${JSON.stringify(targets.environment)}\nAnnahmen: ${targets.assumptions.join(' ')}\n0 Gemini-Aufrufe.`);
  if(args.includes('--output'))await writeFile(flag('--output'),JSON.stringify({ok:true,input,preferences,targets,providerRequests:0},null,2));
  process.exit(0);
}
const mealIndex = args.includes('--meal') ? Number(flag('--meal')) - 1 : 0;
if(!Number.isInteger(mealIndex)||mealIndex<0||mealIndex>7)throw new Error('Mahlzeit: 1 bis 8.');
const backend = fileURLToPath(new URL('../../../backend', import.meta.url));
const python = `import sys,json
sys.path.insert(0,sys.argv[1])
from fuel import gemini
requested=sys.argv[2]
credentials=[v for v in gemini.GEMINI_CREDENTIALS if not requested or v['source']==requested]
# Exactly one actual provider request; no retry/key rotation. Never log a meal.
if not credentials:
 print(json.dumps({'ok':False,'error':'no credentials'}));sys.exit(0)
result=gemini._call_one_credential(credentials[0],sys.stdin.read(),image_b64=None,mime_type='image/jpeg',retries=0,timeout=55,log_label='recipe-terminal')
result['model']=credentials[0]['model']
print(json.dumps(result))`;
const controller = new AbortController();
process.on('SIGINT', () => { controller.abort(); console.log('Gestoppt: bereits erzeugte Gerichte bleiben erhalten.'); });
if (args.includes('--week') && args.includes('--day')) throw new Error('--week und --day nicht kombinieren.');
const selectedDay = args.includes('--day') ? Number(flag('--day')) - 1 : null;
if (selectedDay !== null && (!Number.isInteger(selectedDay) || selectedDay < 0 || selectedDay > 6)) throw new Error('--day: 1 bis 7.');
const replay = args.includes('--replay') ? JSON.parse(await readFile(flag('--replay'), 'utf8')) : null;
const slots = replay ? replay.map((item) => ({ day:item.day,mealIndex:item.mealIndex })) : planRecipeSlots(targets,{week:args.includes('--week'),day:selectedDay,mealIndex});
console.log(`Regeln aus FUEL.md: ${preferences.rules.length ? preferences.rules.join(' | ') : 'keine Kontextdatei/Regeln angegeben'}`);
console.log(`Makrovorgabe: ${targets.macroDescription}`);
console.log(`Essrhythmus: ${targets.rhythm}; Tagesausnahmen werden berücksichtigt.`);
console.log(`${slots.length} Gerichte · ${replay ? 'Nachprüfung, 0' : slots.filter(v=>!v.skip).length} Gemini-Aufrufe · keine Essensbuchungen; globale Rezept-Backups separat gekennzeichnet.`);
const checkpoint = [];
const diagnostics = [];
const results = await runRecipeSlots({ slots, signal: controller.signal, generate: async (slot) => {
  if (replay) {
    const item = replay.find((item) => item.day === slot.day && item.mealIndex === slot.mealIndex);
    return { ...validateRecipeRun(item.value, recipeBudget(targets,slot), slot.previousNames, { style: input.style || 'mixed', preferences, environment:targets.environment }), model: item.model };
  }
  const prompt = buildRecipePrompt(input, targets, { ...slot, preferences });
  const raw = await new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', python, backend, args.includes('--provider')?flag('--provider'):''], { stdio: ['pipe', 'pipe', 'inherit'] });
    let text = '';
    child.stdout.on('data', (chunk) => { text += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code ? reject(new Error(`Fuel provider exited ${code}`)) : resolve(text));
    child.stdin.end(prompt);
  });
  const result = JSON.parse(raw);
  if (!result.ok) throw new Error(result.error || 'Gemini unavailable');
  const value = JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
  diagnostics.push({ day: slot.day, mealIndex, model: result.model, value });
  await writeFile(`${flag('--output')}.raw.json`, JSON.stringify(diagnostics, null, 2));
  return { ...validateRecipeRun(value, recipeBudget(targets,slot), slot.previousNames, { style: input.style || 'mixed', preferences, environment:targets.environment }), model: result.model, generatedAt: new Date().toISOString() };
}, onResult: async (result, completed, total) => {
  if(result.status==='ready'&&!args.includes('--no-catalog')&&(!replay||args.includes('--catalog-db')||args.includes('--catalog-backup'))) {
    try {result.value.catalog=catalog('save',{recipe:result.value.recipes[0],model:result.value.model});console.log(`  Katalog: ${result.value.catalog.created?'gesichert':'bereits vorhanden'} · ${result.value.catalog.id.slice(0,12)}`);}
    catch(error){result.value.catalogError=error.message;console.error(`Katalog-Backup offen: ${error.message}`);}
  }
  checkpoint.push(result);
  await writeFile(flag('--output'), JSON.stringify({ input, preferences, targets, results: checkpoint }, null, 2));
  const label = result.day === null ? 'Einzelgericht' : RECIPE_DAYS[result.day];
  console.log(`[${completed}/${total}] ${label}: ${result.status === 'ready' ? result.value.recipes[0].name : result.status==='skipped'?`KEIN AUFRUF: ${result.reason}`:`FEHLER: ${result.error}`}`);
  if (result.status === 'ready') {
    const recipe = result.value.recipes[0];
    console.log(`  ${recipe.minutes} min; geschätzt ${macros(recipe.estimates)}`);
    console.log(`  Δ Budget: ${Object.keys(recipe.estimates).map((key) => `${key} ${Math.round((recipe.estimates[key] - recipeBudget(targets,result)[key]) * 10) / 10}`).join(' | ')}`);

  }
} });
await writeFile(flag('--output'), JSON.stringify({ input, preferences, targets, results }, null, 2));
const report = ['# Rezeptentwurf · österreichisches Deutsch', '', `Stil: ${input.style || 'mixed'} · Mahlzeit ${mealIndex + 1}`, `Makrovorgabe: ${targets.macroDescription} · Rhythmus: ${targets.rhythm}`, 'Nährwerte sind KI-Schätzungen aus den Zutaten, keine geprüften Katalogwerte.', ''];
for (const result of results) {
  const day = result.day === null ? 'Einzelgericht' : RECIPE_DAYS[result.day];
  report.push(`## ${day}`, '');
  if (result.status !== 'ready') { report.push(result.status==='skipped'?`KEIN AUFRUF: ${result.reason}`:`FEHLER: ${result.error}`, ''); continue; }
  const recipe = result.value.recipes[0];
  report.push(`### ${recipe.name}`, '', `1 Portion · ${recipe.minutes} Minuten · Schätzung: ${macros(recipe.estimates)}`, '', result.value.rationale, '', 'Zutaten:', ...recipe.ingredients.map((item) => `- ${item}`), '', 'Zubereitung:', ...recipe.steps.map((step, i) => `${i + 1}. ${step}`), '', 'Prüfpunkte:', ...result.value.review.map((item) => `- ${item}`), '');
}
await writeFile(`${flag('--output')}.md`, report.join('\n'));
console.log(`Vollständige Rezepte: ${flag('--output')}.md`);
console.log(`Ergebnis: ${results.filter((item) => item.status === 'ready').length}/${slots.length} Gerichte akzeptiert · JSON: ${flag('--output')}`);
if (results.some((item) => item.status === 'error') || controller.signal.aborted) process.exitCode = 1;
