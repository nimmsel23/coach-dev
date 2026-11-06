import { useState } from "react";
import { Save, Check } from "lucide-react";
import { useUser } from "../../contexts/UserContext";
import { updateUserProfile } from "@db";

const inputCls = "w-full rounded-2xl border border-fit-line bg-fit-card px-4 py-3 text-sm font-semibold text-fit-ink outline-none transition-colors focus:border-fit-accent placeholder:text-fit-ink/30";
const metaCls = "text-[10px] font-black uppercase tracking-[0.28em] text-fit-accent";
const labelCls = "text-[11px] font-black uppercase tracking-[0.22em] text-fit-ink/55";
const sublabelCls = "text-xs text-fit-ink/45 leading-snug";

function Section({ meta, title, subtitle, children }) {
  return (
    <section className="rounded-[24px] border border-fit-line bg-fit-card p-5 md:p-6 space-y-5">
      <div className="space-y-2">
        <div className={metaCls}>{meta}</div>
        <h3 className="text-2xl md:text-3xl font-black text-fit-ink leading-none">{title}</h3>
        <p className="text-sm text-fit-ink/65 max-w-3xl">{subtitle}</p>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, value, onChange, placeholder, rows = 4 }) {
  return (
    <label className="grid gap-2">
      <div className="grid gap-1">
        <span className={labelCls}>{label}</span>
        {hint && <span className={sublabelCls}>{hint}</span>}
      </div>
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </label>
  );
}

function Hit({ number, fact, setFact, obstacle, setObstacle, strike, setStrike, responsibility, setResponsibility }) {
  return (
    <div className="rounded-[20px] border border-fit-line bg-fit-bg2/35 p-4 space-y-4">
      <div className="text-sm font-black uppercase tracking-[0.24em] text-fit-ink">{number}</div>
      <Field
        label="Fact"
        hint="The clear, measurable result you aim to achieve."
        value={fact}
        onChange={setFact}
        placeholder="Was ist das klare, messbare Ergebnis, das du zu erreichen suchst?"
      />
      <Field
        label="Obstacle"
        hint="What could prevent you from achieving this fact?"
        value={obstacle}
        onChange={setObstacle}
        placeholder="Was könnte dich daran hindern, dieses Ergebnis zu erreichen?"
      />
      <Field
        label="Strike"
        hint="What’s your strategic move to overcome the obstacle?"
        value={strike}
        onChange={setStrike}
        placeholder="Was ist dein strategischer Zug, um dieses Hindernis zu überwinden?"
      />
      <Field
        label="Responsibility"
        hint="Who is responsible for executing this strike?"
        value={responsibility}
        onChange={setResponsibility}
        placeholder="Wer trägt die Verantwortung für die Ausführung dieses Zuges?"
      />
    </div>
  );
}

export default function Level2({ onEditLevel1 }) {
  const {
    user,
    trainingType, setTrainingType,
    submitFacts, setSubmitFacts,
    submitFeelings, setSubmitFeelings,
    submitFocus, setSubmitFocus,
    submitFruit, setSubmitFruit,
    warStackTrigger, setWarStackTrigger,
    injuries, setInjuries,
    warStackNarrative, setWarStackNarrative,
    warStackValidation, setWarStackValidation,
    warStackImpact, setWarStackImpact,
    warStackConsequences, setWarStackConsequences,
    warStackInsights, setWarStackInsights,
    warStackLesson, setWarStackLesson,
    hit1Fact, setHit1Fact,
    hit1Obstacle, setHit1Obstacle,
    hit1Strike, setHit1Strike,
    hit1Responsibility, setHit1Responsibility,
    hit2Fact, setHit2Fact,
    hit2Obstacle, setHit2Obstacle,
    hit2Strike, setHit2Strike,
    hit2Responsibility, setHit2Responsibility,
    hit3Fact, setHit3Fact,
    hit3Obstacle, setHit3Obstacle,
    hit3Strike, setHit3Strike,
    hit3Responsibility, setHit3Responsibility,
    hit4Fact, setHit4Fact,
    hit4Obstacle, setHit4Obstacle,
    hit4Strike, setHit4Strike,
    hit4Responsibility, setHit4Responsibility,
  } = useUser();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [visibleHits, setVisibleHits] = useState(() => {
    const hitValues = [
      hit1Fact || hit1Obstacle || hit1Strike || hit1Responsibility,
      hit2Fact || hit2Obstacle || hit2Strike || hit2Responsibility,
      hit3Fact || hit3Obstacle || hit3Strike || hit3Responsibility,
      hit4Fact || hit4Obstacle || hit4Strike || hit4Responsibility,
    ];
    const lastFilledIndex = hitValues.reduce((last, value, index) => (value ? index : last), 0);
    return Math.min(4, Math.max(1, lastFilledIndex + 1));
  });

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const success = await updateUserProfile(user.uid, {
      trainingType,
      submitFacts,
      submitFeelings,
      submitFocus,
      submitFruit,
      warStackTrigger,
      injuries,
      warStackNarrative,
      warStackValidation,
      warStackImpact,
      warStackConsequences,
      warStackInsights,
      warStackLesson,
      hit1Fact,
      hit1Obstacle,
      hit1Strike,
      hit1Responsibility,
      hit2Fact,
      hit2Obstacle,
      hit2Strike,
      hit2Responsibility,
      hit3Fact,
      hit3Obstacle,
      hit3Strike,
      hit3Responsibility,
      hit4Fact,
      hit4Obstacle,
      hit4Strike,
      hit4Responsibility,
    });
    if (success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-32">
      <header className="rounded-[24px] border border-fit-line bg-fit-card p-5 md:p-6 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className={metaCls}>LEVEL 2 · REAL · RAW · RELEVANT · RESULTS</div>
          {onEditLevel1 && (
            <button
              type="button"
              onClick={onEditLevel1}
              className="text-[10px] font-black uppercase tracking-[0.2em] text-fit-ink/45 hover:text-fit-accent transition-colors"
            >
              Level 1 bearbeiten
            </button>
          )}
        </div>
        <h2 className="text-3xl md:text-4xl font-black text-fit-ink leading-none">Reflexion</h2>
        <p className="text-sm text-fit-ink/65 max-w-2xl">Reflexives Journaling — tiefer als Level 1.</p>
      </header>

      <Section
        meta="REAL"
        title="Stop"
        subtitle="Ein bewusstes Innehalten. Ein Raum, um zu sehen, zu bedenken und die Geschichten wahrzunehmen, die dich lenken."
      >
        <Field
          label="Trigger"
          hint="What person or event has sparked your desire for change?"
          value={warStackTrigger}
          onChange={setWarStackTrigger}
          placeholder="Welche Person oder welches Ereignis hat in dir den Wunsch nach Veränderung entfacht?"
        />
        <Field
          label="Reality"
          hint="What are the undeniable realities of your current situation?"
          value={trainingType}
          onChange={setTrainingType}
          placeholder="Was sind die unbestreitbaren Wirklichkeiten deiner gegenwärtigen Lage?"
          rows={6}
        />
      </Section>

      <Section
        meta="RAW"
        title="Submit"
        subtitle="Radikale Ehrlichkeit. Offenlegen, erkennen und benennen, was wahr ist, auch wenn es unangenehm ist."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Facts"
            hint="What are the undeniable realities of your current situation?"
            value={submitFacts}
            onChange={setSubmitFacts}
            placeholder="Was sind die unbestreitbaren Wirklichkeiten deiner gegenwärtigen Lage?"
          />
          <Field
            label="Feelings"
            hint="How do you truly feel about these facts?"
            value={submitFeelings}
            onChange={setSubmitFeelings}
            placeholder="Wie fühlst du dich diesen Tatsachen gegenüber in Wahrheit?"
          />
          <Field
            label="Focus"
            hint="What has been your mindset toward these facts and feelings?"
            value={submitFocus}
            onChange={setSubmitFocus}
            placeholder="Welche innere Haltung hattest du diesen Tatsachen und Gefühlen gegenüber?"
          />
          <Field
            label="Fruits"
            hint="What results or outcomes have you gotten from this mindset?"
            value={submitFruit}
            onChange={setSubmitFruit}
            placeholder="Welche Ergebnisse oder Folgen sind aus dieser Haltung hervorgegangen?"
          />
        </div>
      </Section>

      <Section
        meta="RELEVANT"
        title="Struggle"
        subtitle="Der Kampf mit alten Erzählungen, vertrauten Mustern und dem, was dich davon abhält, anders zu handeln."
      >
        <Field
          label="Struggle"
          hint="What are you actively engaging with right now?"
          value={injuries}
          onChange={setInjuries}
          placeholder="Womit ringst du gegenwärtig in tätiger Auseinandersetzung?"
        />
        <Field
          label="Narrative"
          hint="What story are you currently telling yourself?"
          value={warStackNarrative}
          onChange={setWarStackNarrative}
          placeholder="Welche Geschichte erzählst du dir darüber gegenwärtig?"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Validation"
            hint="Why does this feel necessary?"
            value={warStackValidation}
            onChange={setWarStackValidation}
            placeholder="Warum erscheint es dir notwendig, dich dem zuzuwenden?"
          />
          <Field
            label="Impact"
            hint="How would this change your life?"
            value={warStackImpact}
            onChange={setWarStackImpact}
            placeholder="Wie würde sich dein Leben wandeln, wenn sich dies wandelte?"
          />
        </div>
        <Field
          label="Consequences"
          hint="What happens if this stays as it is?"
          value={warStackConsequences}
          onChange={setWarStackConsequences}
          placeholder="Was geschieht, wenn es bleibt, wie es ist?"
        />
      </Section>

      <Section
        meta="RESULTS"
        title="Strike"
        subtitle="Der Übergang von Betrachtung zu Handlung: klare Ergebnisse, Hindernisse, Züge und Verantwortung."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleHits >= 1 && (
            <Hit
              number="Hit 1"
              fact={hit1Fact}
              setFact={setHit1Fact}
              obstacle={hit1Obstacle}
              setObstacle={setHit1Obstacle}
              strike={hit1Strike}
              setStrike={setHit1Strike}
              responsibility={hit1Responsibility}
              setResponsibility={setHit1Responsibility}
            />
          )}
          {visibleHits >= 2 && (
            <Hit
              number="Hit 2"
              fact={hit2Fact}
              setFact={setHit2Fact}
              obstacle={hit2Obstacle}
              setObstacle={setHit2Obstacle}
              strike={hit2Strike}
              setStrike={setHit2Strike}
              responsibility={hit2Responsibility}
              setResponsibility={setHit2Responsibility}
            />
          )}
          {visibleHits >= 3 && (
            <Hit
              number="Hit 3"
              fact={hit3Fact}
              setFact={setHit3Fact}
              obstacle={hit3Obstacle}
              setObstacle={setHit3Obstacle}
              strike={hit3Strike}
              setStrike={setHit3Strike}
              responsibility={hit3Responsibility}
              setResponsibility={setHit3Responsibility}
            />
          )}
          {visibleHits >= 4 && (
            <Hit
              number="Hit 4"
              fact={hit4Fact}
              setFact={setHit4Fact}
              obstacle={hit4Obstacle}
              setObstacle={setHit4Obstacle}
              strike={hit4Strike}
              setStrike={setHit4Strike}
              responsibility={hit4Responsibility}
              setResponsibility={setHit4Responsibility}
            />
          )}
        </div>

        {visibleHits < 4 && (
          <button
            type="button"
            onClick={() => setVisibleHits((count) => Math.min(4, count + 1))}
            className="rounded-2xl border border-fit-line bg-fit-card px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-fit-ink transition-colors hover:border-fit-accent hover:text-fit-accent"
          >
            Hit hinzufügen
          </button>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Insights"
            hint="What new realizations have come to light during this process?"
            value={warStackInsights}
            onChange={setWarStackInsights}
            placeholder="Welche neuen Einsichten sind in diesem Vorgang ans Licht getreten?"
          />
          <Field
            label="Lessons Learned"
            hint="What is the most important life lesson this has taught you?"
            value={warStackLesson}
            onChange={setWarStackLesson}
            placeholder="Was ist die wichtigste Lebenslehre, die dir dieser Vorgang gezeigt hat?"
          />
        </div>
      </Section>

      <button
        onClick={handleSave}
        disabled={saving || !user}
        className="w-full max-w-md mx-auto flex items-center justify-center gap-2 rounded-2xl bg-fit-accent px-4 py-4 text-[10px] font-black uppercase tracking-[0.24em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {saving ? (
          <span className="animate-pulse">Speichert in Cloud...</span>
        ) : saved ? (
          <>
            <Check size={14} /> Cloud synchronisiert
          </>
        ) : (
          <>
            <Save size={14} /> Anamnese sichern
          </>
        )}
      </button>
    </div>
  );
}
