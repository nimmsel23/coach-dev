import { getGenerativeModel } from 'firebase/ai';
import { getVertexAI } from '../../firebase.js';
import { buildRecipePrompt, validateRecipeRun } from './recipeRuns.js';

// Exactly one provider call per dish. Shared prompt/validation with recipe-cli.mjs.
export async function generateNutritionIdeas(input, targets, options = {}) {
  const ai = getVertexAI();
  if (!ai) throw new Error('Gemini ist hier nicht verfügbar. Berechnung und Speichern funktionieren weiterhin.');
  const model = getGenerativeModel(ai, { model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 5000 } });
  const prompt = buildRecipePrompt(input, targets, options);
  let timer, abort;
  try {
    if (options.signal?.aborted) throw new Error('Abgebrochen.');
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Gemini antwortet nicht rechtzeitig. Bitte einzeln erneut versuchen.')), 60000); }),
      new Promise((_, reject) => { abort = () => reject(new Error('Abgebrochen.')); options.signal?.addEventListener('abort', abort, { once: true }); }),
    ]);
    const raw = JSON.parse(result.response.text());
    return { ...validateRecipeRun(raw, targets.mealTargets[options.mealIndex || 0], options.previousNames, { style: input.style, preferences: options.preferences }), model: 'gemini-2.5-flash', generatedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Gemini hat kein lesbares Rezeptformat geliefert. Bitte einzeln erneut versuchen.', { cause: error });
    throw error;
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
