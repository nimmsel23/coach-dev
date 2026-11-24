// Read-only terminal acceptance using the same prompt, validator and scheduler as the UI.
// node src/lib/nutrition/recipe-cli.mjs --input /tmp/profile.json [--week | --day 1] [--meal 1] [--replay raw.json] --output /tmp/recipes.json
import { readFile, writeFile as writeRaw, rename, unlink, realpath } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
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
if (!args.includes('--input') || !args.includes('--output')) {
  console.log('Usage: node src/lib/nutrition/recipe-cli.mjs --input profile.json --output recipes.json [--week | --day 1] [--meal 1] [--replay raw.json]');
  process.exit(1);
}
if (extname(flag('--output')) !== '.json') throw new Error('--output muss eine JSON-Datei sein.');
const outputPath = await realpath(flag('--output')).catch(() => resolve(flag('--output')));
for (const name of ['--input', '--context']) if (args.includes(name) && outputPath === await realpath(flag(name))) throw new Error('Eingabe/FUEL.md darf nicht als Ausgabedatei überschrieben werden.');
const profile = JSON.parse(await readFile(flag('--input'), 'utf8'));
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
const targets = calculateNutritionTargets(input);
const mealIndex = args.includes('--meal') ? Number(flag('--meal')) - 1 : 0;
if (!targets.mealTargets[mealIndex]) throw new Error('Mahlzeit existiert nicht.');
const backend = fileURLToPath(new URL('../../../backend', import.meta.url));
const python = `import sys,json
sys.path.insert(0,sys.argv[1])
from fuel import gemini
# Exactly one actual provider request; no retry/key rotation. Never log a meal.
if not gemini.GEMINI_CREDENTIALS:
 print(json.dumps({'ok':False,'error':'no credentials'}));sys.exit(0)
result=gemini._call_one_credential(gemini.GEMINI_CREDENTIALS[0],sys.stdin.read(),image_b64=None,mime_type='image/jpeg',retries=0,timeout=55,log_label='recipe-terminal')
result['model']=gemini.GEMINI_CREDENTIALS[0]['model']
print(json.dumps(result))`;
const controller = new AbortController();
process.on('SIGINT', () => { controller.abort(); console.log('Stop requested; completed dishes will be retained.'); });
if (args.includes('--week') && args.includes('--day')) throw new Error('--week und --day nicht kombinieren.');
const selectedDay = args.includes('--day') ? Number(flag('--day')) - 1 : null;
if (selectedDay !== null && (!Number.isInteger(selectedDay) || selectedDay < 0 || selectedDay > 6)) throw new Error('--day: 1 bis 7.');
const replay = args.includes('--replay') ? JSON.parse(await readFile(flag('--replay'), 'utf8')) : null;
const slots = replay ? replay.map((item) => ({ day: item.day, mealIndex: item.mealIndex })) : Array.from({ length: args.includes('--week') ? 7 : 1 }, (_, day) => ({ day: args.includes('--week') ? day : selectedDay, mealIndex }));
console.log(`Regeln aus FUEL.md: ${preferences.rules.length ? preferences.rules.join(' | ') : 'keine Kontextdatei/Regeln angegeben'}`);
console.log(`Budget je Gericht: ${macros(targets.mealTargets[mealIndex])}`);
console.log(`${slots.length} Gerichte · ${replay ? 'Nachprüfung, 0' : slots.length} Gemini-Aufrufe · keine Buchungen oder Katalogänderungen.`);
const checkpoint = [];
const diagnostics = [];
const results = await runRecipeSlots({ slots, signal: controller.signal, generate: async (slot) => {
  if (replay) {
    const item = replay.find((item) => item.day === slot.day && item.mealIndex === slot.mealIndex);
    return { ...validateRecipeRun(item.value, targets.mealTargets[slot.mealIndex], slot.previousNames, { style: input.style || 'mixed', preferences }), model: item.model };
  }
  const prompt = buildRecipePrompt(input, targets, { ...slot, preferences });
  const raw = await new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', python, backend], { stdio: ['pipe', 'pipe', 'inherit'] });
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
  return { ...validateRecipeRun(value, targets.mealTargets[mealIndex], slot.previousNames, { style: input.style || 'mixed', preferences }), model: result.model, generatedAt: new Date().toISOString() };
}, onResult: async (result, completed, total) => {
  checkpoint.push(result);
  await writeFile(flag('--output'), JSON.stringify({ input, preferences, targets, results: checkpoint }, null, 2));
  const label = result.day === null ? 'Einzelgericht' : RECIPE_DAYS[result.day];
  console.log(`[${completed}/${total}] ${label}: ${result.status === 'ready' ? result.value.recipes[0].name : `FEHLER: ${result.error}`}`);
  if (result.status === 'ready') {
    const recipe = result.value.recipes[0];
    console.log(`  ${recipe.minutes} min; geschätzt ${macros(recipe.estimates)}`);
    console.log(`  Δ Budget: ${Object.keys(recipe.estimates).map((key) => `${key} ${Math.round((recipe.estimates[key] - targets.mealTargets[mealIndex][key]) * 10) / 10}`).join(' | ')}`);

  }
} });
await writeFile(flag('--output'), JSON.stringify({ input, preferences, targets, results }, null, 2));
const report = ['# Rezeptentwurf · österreichisches Deutsch', '', `Stil: ${input.style || 'mixed'} · Mahlzeit ${mealIndex + 1}`, `Budget je Gericht: ${macros(targets.mealTargets[mealIndex])}`, 'Nährwerte sind KI-Schätzungen aus den Zutaten, keine geprüften Katalogwerte.', ''];
for (const result of results) {
  const day = result.day === null ? 'Einzelgericht' : RECIPE_DAYS[result.day];
  report.push(`## ${day}`, '');
  if (result.status !== 'ready') { report.push(`FEHLER: ${result.error}`, ''); continue; }
  const recipe = result.value.recipes[0];
  report.push(`### ${recipe.name}`, '', `1 Portion · ${recipe.minutes} Minuten · Schätzung: ${macros(recipe.estimates)}`, '', result.value.rationale, '', 'Zutaten:', ...recipe.ingredients.map((item) => `- ${item}`), '', 'Zubereitung:', ...recipe.steps.map((step, i) => `${i + 1}. ${step}`), '', 'Prüfpunkte:', ...result.value.review.map((item) => `- ${item}`), '');
}
await writeFile(`${flag('--output')}.md`, report.join('\n'));
console.log(`Vollständige Rezepte: ${flag('--output')}.md`);
console.log(`Ergebnis: ${results.filter((item) => item.status === 'ready').length}/${slots.length} Gerichte akzeptiert · JSON: ${flag('--output')}`);
if (results.some((item) => item.status === 'error') || controller.signal.aborted) process.exitCode = 1;
