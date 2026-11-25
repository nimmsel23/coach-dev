import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNutritionTargets, EMPTY_NUTRITION_INPUT, nutritionAiContext } from '../../lib/nutrition/targets.js';
import { planRecipeSlots, recipeBudget } from '../../lib/nutrition/profile.js';
import { runRecipeSlots, validateRecipeStyle } from '../../lib/nutrition/recipeRuns.js';
const input={...EMPTY_NUTRITION_INPUT,scope:'general',age:'35',weight:'80',method:'manual',maintenance:'2400'};
test('ratios specify energy percentages, HFHP is independent from food style',()=>{
  const a=calculateNutritionTargets({...input,macroMode:'ratio',proteinPercent:'30',fatPercent:'30',carbsPercent:'40'});
  assert.deepEqual([a.proteinG,a.fatG,a.carbsG],[180,80,240]);
  const b=calculateNutritionTargets({...input,macroMode:'ratio',proteinPercent:'30',fatPercent:'50',carbsPercent:'20',macroIntent:'High Fat / High Protein',style:'mediterran, österreichische Küche'});
  assert.deepEqual([b.proteinG,b.fatG,b.carbsG],[180,133,120]);
  assert.throws(()=>calculateNutritionTargets({...input,macroMode:'ratio',proteinPercent:'30',fatPercent:'30',carbsPercent:'30'}),/100/);
  validateRecipeStyle([{name:'Rindfleisch'}],'mediterran und österreichisch');
  assert.throws(()=>validateRecipeStyle([{name:'Rindfleisch'}],'mediterran, vegetarisch'),/vegetarisch/);
  validateRecipeStyle([{name:'Rindfleisch'}],'nicht vegetarisch');
});
test('explicit grams must agree with energy target and qualitative intent alone stays unresolved',()=>{
  assert.equal(calculateNutritionTargets({...input,macroMode:'grams',proteinGrams:'180',fatGrams:'80',carbsGrams:'240'}).macroKcal,2400);
  assert.throws(()=>calculateNutritionTargets({...input,macroMode:'grams',proteinGrams:'100',fatGrams:'20',carbsGrams:'100'}),/widersprechen/);
  assert.throws(()=>calculateNutritionTargets({...input,macroMode:'qualitative',macroIntent:'High Fat High Protein'}),/keine Zahlen/);
});
test('OMAD, windows and unequal meal shares conserve totals',()=>{
  const omad=calculateNutritionTargets({...input,rhythm:'omad',mealTimes:'19:00',windowStart:'18:00',windowEnd:'20:00'});
  assert.equal(omad.mealTargets.length,1);assert.equal(omad.mealTargets[0].kcal,2400);
  const split=calculateNutritionTargets({...input,mealShares:'30,30,40',mealTimes:'12:00,16:00,20:00',windowStart:'12:00',windowEnd:'20:00'});
  assert.deepEqual(split.mealTargets.map(v=>v.kcal),[720,720,960]);
  assert.throws(()=>calculateNutritionTargets({...input,mealTimes:'08:00,12:00,20:00',windowStart:'12:00',windowEnd:'20:00'}),/außerhalb/);
  const overnight=calculateNutritionTargets({...input,rhythm:'omad',mealTimes:'01:00',windowStart:'22:00',windowEnd:'02:00'});
  assert.equal(overnight.window.hours,4);
});
test('weekly rhythm exceptions skip NOMAD without provider requests or calorie compensation',async()=>{
  const targets=calculateNutritionTargets({...input,meals:'2',weekOverrides:JSON.stringify([{day:0,rhythm:'nomad'},{day:2,rhythm:'omad',times:['19:00']}])});
  assert.equal(targets.week[0].mealTargets.length,0);assert.equal(targets.week[1].mealTargets.reduce((s,v)=>s+v.kcal,0),2400);
  assert.equal(recipeBudget(targets,{day:2,mealIndex:0}).kcal,2400);
  let calls=0;
  const results=await runRecipeSlots({slots:planRecipeSlots(targets,{week:true,mealIndex:0}),generate:async()=>{calls++;return{recipes:[{name:'Gericht'}]};}});
  assert.equal(calls,6);assert.equal(results[0].status,'skipped');
  const slots=planRecipeSlots(targets,{week:true,mealIndex:1});
  assert.ok(slots[2].skip);
});
test('environment has explicit enforceable and free context without leaking profiles',()=>{
  const targets=calculateNutritionTargets({...input,cookingMinutes:'20',budgetPerMeal:'8',equipment:'Mikrowelle',location:'Büro',workSchedule:'Nachtschicht',trainingSchedule:'18 Uhr',conditions:'Kalt essbar'});
  const context=nutritionAiContext({...input,name:'privat'},targets);
  assert.equal(context.environment.cookingMinutes,20);assert.equal(context.environment.equipment,'Mikrowelle');
  assert.equal(JSON.stringify(context).includes('privat'),false);
  assert.throws(()=>calculateNutritionTargets({...input,cookingMinutes:'-5'}),/Kochzeit/);
});
