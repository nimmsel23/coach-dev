import { useState } from "react";
import { Save, Lock, Sparkles } from "lucide-react";
import { useUser } from "../../contexts/UserContext";
import { updateUserProfile } from "@db";

const metaCls = "text-[10px] font-black uppercase tracking-[0.28em] text-fit-accent";
const labelCls = "text-[11px] font-black uppercase tracking-[0.22em] text-fit-ink/55";
const selectCls = "w-full rounded-2xl border border-fit-line bg-fit-card px-4 py-3 text-sm font-semibold text-fit-ink outline-none transition-colors focus:border-fit-accent";
const inputCls = selectCls;

function Section({ title, children }) {
  return (
    <section className="rounded-[24px] border border-fit-line bg-fit-card p-5 md:p-6 space-y-4">
      <h3 className="text-lg font-black text-fit-ink leading-none">{title}</h3>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function SelectField({ label, value, onChange, options, tracked }) {
  return (
    <label className="grid gap-2">
      <span className={labelCls}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
        {tracked && <option value="">— auswählen —</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange, unit }) {
  return (
    <label className="grid gap-2">
      <span className={labelCls}>{label}{unit ? ` (${unit})` : ""}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className={inputCls}
      />
    </label>
  );
}

const YES_NO = ["Nein", "Ja"];
const GOALS = ["Muskelaufbau", "Fettabbau", "Kraft", "Ausdauer", "Gesundheit & Wohlbefinden"];

export default function Level1({ onComplete }) {
  const {
    user,
    gender, setGender,
    age, setAge,
    heightCm, setHeightCm,
    weightKg, setWeightKg,
    split, setSplit,
    defaultLocation, setDefaultLocation,
    trainingExperience, setTrainingExperience,
    trainingFrequency, setTrainingFrequency,
    fitnessGoal, setFitnessGoal,
    secondaryGoal, setSecondaryGoal,
    activityLevel, setActivityLevel,
    energyLevel, setEnergyLevel,
    recoveryQuality, setRecoveryQuality,
    chronicConditions, setChronicConditions,
    medications, setMedications,
    medicalClearanceNotes, setMedicalClearanceNotes,
    setLevel1Complete,
  } = useUser();

  const [saving, setSaving] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);

  const trackedFields = [
    trainingExperience, trainingFrequency, fitnessGoal, secondaryGoal,
    activityLevel, energyLevel, recoveryQuality,
    chronicConditions, medications, medicalClearanceNotes,
  ];
  const filledCount = trackedFields.filter((v) => v?.trim()).length;
  const totalCount = trackedFields.length;
  const allFilled = filledCount === totalCount;
  const progressPct = Math.round((filledCount / totalCount) * 100);

  async function handleComplete() {
    if (!user || !allFilled) return;
    setSaving(true);
    const success = await updateUserProfile(user.uid, {
      gender, age, heightCm, weightKg, split, defaultLocation,
      trainingExperience, trainingFrequency, fitnessGoal, secondaryGoal,
      activityLevel, energyLevel, recoveryQuality,
      chronicConditions, medications, medicalClearanceNotes,
      level1Complete: true,
    });
    setSaving(false);
    if (success) {
      setLevel1Complete(true);
      setJustUnlocked(true);
    }
  }

  if (justUnlocked) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-32 text-center">
        <div className="rounded-[24px] border border-fit-accent/40 bg-fit-card p-8 space-y-4">
          <Sparkles className="mx-auto text-fit-accent" size={40} />
          <div className={metaCls}>LEVEL 1 · ABGESCHLOSSEN</div>
          <h2 className="text-3xl font-black text-fit-ink leading-tight">Level 2 freigeschaltet</h2>
          <p className="text-sm text-fit-ink/65 max-w-md mx-auto">
            Die Basis-Anamnese ist gespeichert. Ab jetzt geht es tiefer: das reflexive
            Journaling — REAL · RAW · RELEVANT · RESULTS.
          </p>
          <button
            onClick={() => onComplete?.()}
            className="w-full max-w-xs mx-auto flex items-center justify-center gap-2 rounded-2xl bg-fit-accent px-4 py-4 text-[10px] font-black uppercase tracking-[0.24em] text-white transition-opacity hover:opacity-90"
          >
            Weiter zu Level 2
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-32">
      <header className="rounded-[24px] border border-fit-line bg-fit-card p-5 md:p-6 space-y-3">
        <div className={metaCls}>LEVEL 1 · ANAMNESE</div>
        <h2 className="text-3xl md:text-4xl font-black text-fit-ink leading-none">Anamnese</h2>
        <p className="text-sm text-fit-ink/65 max-w-2xl">
          Die Basics, damit dein Training zu dir passt. Kurz, klar, per Dropdown.
        </p>
        <div className="space-y-1.5 pt-2">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-fit-ink/55">
            <span>Fortschritt</span>
            <span>{filledCount}/{totalCount}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-fit-bg2 overflow-hidden">
            <div
              className="h-full rounded-full bg-fit-accent transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </header>

      <Section title="Körperdaten">
        <SelectField label="Geschlecht" value={gender} onChange={setGender} options={["male", "female", "other"]} />
        <NumberField label="Alter" value={age} onChange={setAge} unit="Jahre" />
        <NumberField label="Größe" value={heightCm} onChange={setHeightCm} unit="cm" />
        <NumberField label="Gewicht" value={weightKg} onChange={setWeightKg} unit="kg" />
      </Section>

      <Section title="Training">
        <SelectField label="Trainingserfahrung" value={trainingExperience} onChange={setTrainingExperience} options={["Anfänger", "Fortgeschritten", "Erfahren"]} tracked />
        <SelectField label="Trainingsfrequenz" value={trainingFrequency} onChange={setTrainingFrequency} options={["1–2x/Woche", "3–4x/Woche", "5–6x/Woche", "Täglich"]} tracked />
        <SelectField label="Bevorzugter Split" value={split} onChange={setSplit} options={["PPL", "Ganzkörper", "Oberkörper/Unterkörper", "Bro-Split"]} />
        <SelectField label="Trainingsort" value={defaultLocation} onChange={setDefaultLocation} options={["Home", "Gym", "Outdoor"]} />
      </Section>

      <Section title="Ziele">
        <SelectField label="Hauptziel" value={fitnessGoal} onChange={setFitnessGoal} options={GOALS} tracked />
        <SelectField label="Sekundärziel" value={secondaryGoal} onChange={setSecondaryGoal} options={["Keins", ...GOALS]} tracked />
      </Section>

      <Section title="Alltag & Erholung">
        <SelectField label="Alltagsaktivität" value={activityLevel} onChange={setActivityLevel} options={["Sitzend", "Leicht aktiv", "Mäßig aktiv", "Sehr aktiv"]} tracked />
        <SelectField label="Energielevel" value={energyLevel} onChange={setEnergyLevel} options={["Niedrig", "Mittel", "Hoch"]} tracked />
        <SelectField label="Regeneration/Schlaf" value={recoveryQuality} onChange={setRecoveryQuality} options={["Schlecht", "Mittel", "Gut"]} tracked />
      </Section>

      <Section title="Gesundheit">
        <SelectField label="Vorerkrankungen?" value={chronicConditions} onChange={setChronicConditions} options={YES_NO} tracked />
        <SelectField label="Medikamente?" value={medications} onChange={setMedications} options={YES_NO} tracked />
        <SelectField label="Ärztliche Freigabe nötig?" value={medicalClearanceNotes} onChange={setMedicalClearanceNotes} options={YES_NO} tracked />
      </Section>

      <button
        onClick={handleComplete}
        disabled={saving || !user || !allFilled}
        className="w-full max-w-md mx-auto flex items-center justify-center gap-2 rounded-2xl bg-fit-accent px-4 py-4 text-[10px] font-black uppercase tracking-[0.24em] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {saving ? (
          <span className="animate-pulse">Speichert...</span>
        ) : !allFilled ? (
          <>
            <Lock size={14} /> Noch {totalCount - filledCount} offen
          </>
        ) : (
          <>
            <Save size={14} /> Level 1 abschließen
          </>
        )}
      </button>
    </div>
  );
}
