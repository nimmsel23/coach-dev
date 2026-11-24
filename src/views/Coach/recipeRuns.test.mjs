import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecipePrompt, runRecipeSlots, validateRecipeRun } from '../../lib/nutrition/recipeRuns.js';
import { calculateNutritionTargets, EMPTY_NUTRITION_INPUT } from '../../lib/nutrition/targets.js';
const input = { ...EMPTY_NUTRITION_INPUT, age:'35',weight:'80',method:'manual',maintenance:'2400',scope:'general',foods:'Testzutat' };
const targets = calculateNutritionTargets(input);
const budget = targets.mealTargets[0];
const payload = (name='Gericht') => ({ rationale:'Passt zum Alltag.', review:['Schätzwerte prüfen.'], recipes:[{name,servings:1,minutes:25,ingredients:[{name:'Testzutat',grams:400,state:'verzehrfertig',per100:Object.fromEntries(Object.entries(budget).map(([key,value])=>[key,value/4]))}],steps:['Die Zutaten entsprechend der Grammangaben abwiegen und in etwa zwei Zentimeter große Stücke schneiden.','Eine Pfanne auf mittlerer Hitze erwärmen und die Zutaten zehn Minuten unter gelegentlichem Wenden garen.','Anschließend auf einem Teller anrichten und vor dem Servieren Temperatur und Konsistenz prüfen.']}] });
test('one dish: ingredient arithmetic and portion budget are checked without trusting model totals', () => {
  const value = validateRecipeRun(payload(), budget);
  assert.equal(value.recipes.length, 1);
  assert.deepEqual(value.recipes[0].estimates,budget);
  for (const mutate of [v=>v.recipes.push(v.recipes[0]),v=>v.recipes[0].ingredients[0].grams=0,v=>v.recipes[0].ingredients[0].state='',v=>v.recipes[0].ingredients[0].per100.kcal=1,v=>v.recipes[0].ingredients[0].grams=50]) {
    const value=structuredClone(payload()); mutate(value); assert.throws(()=>validateRecipeRun(value,budget));
  }
  assert.throws(()=>validateRecipeRun(payload(),budget,['gericht']),/wiederholt/);
});
test('seven slots run sequentially once each, retain partial success and pass variety context', async () => {
  let active=0,max=0,calls=0; const progress=[];
  const results=await runRecipeSlots({slots:Array.from({length:7},(_,day)=>({day,mealIndex:0})),generate:async(slot)=>{
    calls++;active++;max=Math.max(max,active);await Promise.resolve();active--;
    if(slot.day===2)throw new Error('temporary failure');
    if(slot.day>2)assert.ok(slot.previousNames.includes('Gericht 1'));
    return validateRecipeRun(payload(`Gericht ${slot.day}`),budget,slot.previousNames);
  },onResult:(result,done)=>progress.push([result.status,done])});
  assert.equal(calls,7);assert.equal(max,1);assert.equal(results.filter(r=>r.status==='ready').length,6);
  assert.equal(results[2].error,'temporary failure');assert.equal(progress.at(-1)[1],7);
});
test('stop schedules no further requests and discards the cancelled in-flight result', async () => {
  const controller=new AbortController();let calls=0;
  const results=await runRecipeSlots({slots:[{day:0},{day:1},{day:2}],signal:controller.signal,generate:async()=>{
    calls++;if(calls===2)controller.abort();return validateRecipeRun(payload(),budget);
  }});
  assert.equal(calls,2);assert.equal(results.length,1);
});
test('prompt scopes one dish to one meal and carries prior names and hard exclusions', () => {
  const prompt=buildRecipePrompt({...input,exclusions:'Keine Nüsse'},targets,{mealIndex:1,day:3,previousNames:['Linsentopf']});
  assert.match(prompt,/EIN Rezept/);assert.match(prompt,/Donnerstag/);assert.match(prompt,/Linsentopf/);assert.match(prompt,/Keine Nüsse/);
  assert.throws(()=>buildRecipePrompt(input,targets,{mealIndex:99}));
});
test('raw poultry washing is rejected and raw poultry needs explicit safe cooking instructions', () => {
  const value=payload();value.recipes[0].ingredients[0].name='Hühnerbrust';value.recipes[0].ingredients[0].state='roh';
  value.recipes[0].steps[0]='Die Hühnerbrust waschen, dann braten.';
  assert.throws(()=>validateRecipeRun(value,budget),/Unsichere/);
  value.recipes[0].steps[0]='Die Hühnerbrust nicht waschen. Bei mittlerer Hitze braten.';
  assert.throws(()=>validateRecipeRun(value,budget),/Durchgar/);
  value.recipes[0].steps[0]='Die Hühnerbrust nicht waschen. Mit Thermometer 70 °C im Kern für zwei Minuten sicherstellen.';
  assert.equal(validateRecipeRun(value,budget).recipes.length,1);
});
test('Austrian wording, optional pantry, tofu only vegan and Paleo ingredient exclusions', async () => {
  const { austrianRecipeText,validateRecipeStyle,extractNutritionPreferences,validateFoodExclusions }=await import('../../lib/nutrition/recipeRuns.js');
  assert.equal(austrianRecipeText('Hähnchen mit Kartoffeln und Quark'),'Hendl mit Erdäpfeln und Topfen');
  assert.match(buildRecipePrompt({...input,foods:'',style:'paleo'},targets),/KEINE Pflicht/);
  assert.throws(()=>validateRecipeStyle([{name:'Naturtofu'}],'mixed'),/Tofu/);
  validateRecipeStyle([{name:'Naturtofu'}],'plant-based');
  assert.throws(()=>validateRecipeStyle([{name:'Reis'}],'paleo'),/Paleo/);
  validateRecipeStyle([{name:'Süßerdäpfel'},{name:'Kokosmilch'}],'paleo');
  const preferences=extractNutritionPreferences('# FUEL\n- kein Tofu\n- keine Nüsse\nVorlieben: österreichische Küche\nName: nicht an KI senden');
  assert.deepEqual(preferences.excludedFoods,['tofu','nüsse']);
  assert.equal(JSON.stringify(preferences).includes('Name'),false);
  assert.throws(()=>validateFoodExclusions([{name:'Naturtofu'}],preferences.excludedFoods),/FUEL.md/);
  const vegan=payload('Tofupfanne');vegan.recipes[0].ingredients[0].name='Naturtofu';
  assert.throws(()=>validateRecipeRun(vegan,budget,[],{style:'plant-based',preferences}),/FUEL.md/);
});
