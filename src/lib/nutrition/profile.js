// Independent dimensions: macro prescription, timing, food choices and everyday conditions.
export function finiteNumber(value, min, max, label) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value.replace(',', '.')) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label}: bitte einen Wert von ${min} bis ${max} eingeben.`);
  return n;
}
const list = (value) => Array.isArray(value) ? value : String(value || '').split(/[,;\n]/).map(v => v.trim()).filter(Boolean);
const clock = (value) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`Ungültige Uhrzeit: ${value}. Bitte HH:MM verwenden.`);
  return Number(value.slice(0,2)) * 60 + Number(value.slice(3));
};
export function dietaryFlags(style = '') {
  const text = String(style).toLocaleLowerCase('de').replace(/\b(?:nicht|kein(?:e[nmrs]?)?)\s+(?:vegan|vegetarisch|paleo|pescetarisch)\b/giu, '');
  return { vegan: !/nicht\s+vegan|kein\s+vegan/iu.test(text) && /\bvegan\b|plant-based/iu.test(text),
    vegetarian: /vegetari|vegetarian/iu.test(text), pescatarian: /pesc|pesco/iu.test(text), paleo: /\bpaleo\b/iu.test(text) };
}
export function resolveMealTiming(input, totals, override = {}) {
  const rhythm = override.rhythm || input.rhythm || 'meals';
  if (!['meals','omad','nomad'].includes(rhythm)) throw new Error('Essrhythmus: Mahlzeiten, OMAD oder NOMAD wählen.');
  const count = rhythm === 'nomad' ? 0 : rhythm === 'omad' ? 1 : finiteNumber(override.meals ?? input.meals, 1, 8, 'Mahlzeitenzahl');
  if (!Number.isInteger(count)) throw new Error('Mahlzeitenzahl muss ganzzahlig sein.');
  if (rhythm === 'nomad') return { rhythm, mealTargets: [], times: [], window: null, note:'Kein Gericht geplant. Keine automatische Kalorienverschiebung auf andere Tage.' };
  const times = list(override.times ?? input.mealTimes);
  if (times.length && times.length !== count) throw new Error(`${count} Mahlzeiten, aber ${times.length} Uhrzeiten. Zeitenzahl anpassen.`);
  times.forEach(clock);
  if (new Set(times).size !== times.length) throw new Error('Mahlzeiten brauchen unterschiedliche Uhrzeiten.');
  const start = override.windowStart ?? input.windowStart;
  const end = override.windowEnd ?? input.windowEnd;
  if (Boolean(start) !== Boolean(end)) throw new Error('Essensfenster braucht Anfang und Ende.');
  let window = null;
  if (start && end) {
    const a=clock(start),b=clock(end),duration=(b-a+1440)%1440;
    if (!duration) throw new Error('Essensfenster darf nicht null Stunden lang sein.');
    for (const time of times) if ((clock(time)-a+1440)%1440 > duration) throw new Error(`Mahlzeit ${time} liegt außerhalb des Essensfensters ${start}–${end}.`);
    window={start,end,hours:duration/60};
  }
  const rawShares=list(override.shares ?? (rhythm==='omad' ? '' : input.mealShares));
  const shares=rawShares.length ? rawShares.map(v=>finiteNumber(v,0.1,100,'Mahlzeitenanteil (%)')) : Array(count).fill(100/count);
  if(shares.length!==count || Math.abs(shares.reduce((a,b)=>a+b,0)-100)>0.01) throw new Error('Mahlzeitenanteile müssen zur Anzahl passen und zusammen 100 % ergeben.');
  const mealTargets=Array.from({length:count},()=>({}));
  for(const [key,total] of Object.entries(totals)) {
    const exact=shares.map(v=>total*v/100), rounded=exact.map(Math.floor);
    const order=exact.map((v,i)=>({i,rest:v-rounded[i]})).sort((a,b)=>b.rest-a.rest);
    const remaining=total-rounded.reduce((a,b)=>a+b,0);
    for(let i=0;i<remaining;i++) rounded[order[i].i]++;
    rounded.forEach((value,i)=>{mealTargets[i][key]=value;});
  }
  return {rhythm,mealTargets,times,window,shares};
}
export function buildNutritionTiming(input,totals) {
  const daily=resolveMealTiming(input,totals);
  let overrides=[];
  if(input.weekOverrides) {
    try {overrides=JSON.parse(input.weekOverrides);} catch(error){throw new Error('Ungültiger Wochenrhythmus.',{cause:error});}
    if(!Array.isArray(overrides)||overrides.length>7)throw new Error('Wochenrhythmus muss höchstens sieben Tagesausnahmen enthalten.');
    const seen=new Set();
    for(const item of overrides){if(!item||!Number.isInteger(item.day)||item.day<0||item.day>6||seen.has(item.day))throw new Error('Tagesausnahmen brauchen eindeutige Wochentage 0–6.');seen.add(item.day);}
  }
  return {...daily,week:Array.from({length:7},(_,day)=>({day,...resolveMealTiming(input,totals,overrides.find(v=>v.day===day)||{})}))};
}
export function recipeBudget(targets, {day=null,mealIndex=0}={}) {
  const timing=day===null ? targets : targets.week?.[day] || targets;
  const budget=timing.mealTargets[mealIndex];
  if(!budget)throw new Error(timing.rhythm==='nomad'?'NOMAD: Für diesen Tag wird kein Gericht erzeugt.':'Das gewählte Mahlzeitenbudget existiert an diesem Tag nicht.');
  return budget;
}
export function planRecipeSlots(targets,{week=false,day=null,mealIndex=0,id='single'}={}) {
  return (week ? Array.from({length:7},(_,day)=>day) : [day]).map((day)=>{
    const slot={id:week?`week-${day}-${mealIndex}`:id,day,mealIndex};
    try{recipeBudget(targets,slot);}catch(error){slot.skip=error.message;}
    return slot;
  });
}
export function environmentOf(input) {
  return {cookingMinutes:input.cookingMinutes?finiteNumber(input.cookingMinutes,1,240,'Kochzeit (Minuten)'):null,
    budgetPerMeal:input.budgetPerMeal?finiteNumber(input.budgetPerMeal,0.1,200,'Budget pro Mahlzeit (EUR)'):null,
    equipment:input.equipment||'',location:input.location||'',workSchedule:input.workSchedule||'',trainingSchedule:input.trainingSchedule||'',conditions:input.conditions||''};
}
