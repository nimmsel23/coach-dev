import { useState, useEffect } from 'react';
import { User2, Save, Check, LogOut } from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import { updateUserProfile, isLocalMode } from '@db';

const inputCls = "w-full bg-fit-bg2 border border-fit-line rounded-xl px-4 py-3 text-sm font-bold text-fit-ink focus:border-fit-accent outline-none transition-colors";

export default function ProfileSection() {
  const {
    user,
    gender, setGender,
    age, setAge,
    heightCm, setHeightCm,
    weightKg, setWeightKg,
    signOut,
  } = useUser();

  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user?.displayName) setDisplayName(user.displayName);
  }, [user]);

  async function handleSave() {
    if (!user || !user.uid) return;
    setSaving(true);

    const success = await updateUserProfile(user.uid, {
      displayName,
      email: user.email,
      gender,
      age,
      heightCm,
      weightKg
    });

    if (success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  if (!user) return null;

  return (
    <section className="card p-6 space-y-5 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-fit-accent/10 flex items-center justify-center shrink-0">
            <User2 size={18} className="text-fit-accent" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-fit-ink">Körperprofil</h3>
            <div className="text-xs text-fit-dim truncate" style={{ opacity: 0.6 }}>{user.email}</div>
          </div>
        </div>
        {!isLocalMode() && (
          <button
            onClick={() => { if (window.confirm('Wirklich abmelden?')) signOut(); }}
            className="flex items-center gap-1.5 shrink-0 px-3 py-2 text-xs font-semibold text-fit-red bg-fit-red/5 border border-fit-red/10 rounded-full hover:bg-fit-red/10 transition-all"
            title="Abmelden"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Abmelden</span>
          </button>
        )}
      </div>

      <div>
        <div className="text-xs font-medium mb-2 ml-1" style={{ color: 'var(--dim)', opacity: 0.7 }}>Anzeigename (für den Coach)</div>
        <input
          type="text"
          value={displayName}
          placeholder="Dein Vor- und Nachname"
          onChange={e => setDisplayName(e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-medium mb-2 ml-1" style={{ color: 'var(--dim)', opacity: 0.7 }}>Geschlecht</div>
          <div className="flex gap-1 p-1 bg-fit-bg2 rounded-xl border border-fit-line">
            {[{ id: 'm', label: 'Männlich' }, { id: 'f', label: 'Weiblich' }].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setGender(id)}
                className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${gender === id ? 'bg-fit-card shadow-xs text-fit-accent' : 'text-fit-dim hover:text-fit-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium mb-2 ml-1" style={{ color: 'var(--dim)', opacity: 0.7 }}>Alter</div>
          <input
            type="number" value={age || ''} min={15} max={99}
            onChange={e => setAge(Number(e.target.value))}
            className={inputCls}
          />
          <div className="text-xs ml-1 mt-1" style={{ color: 'var(--dim)', opacity: 0.5 }}>Jahre</div>
        </div>

        <div>
          <div className="text-xs font-medium mb-2 ml-1" style={{ color: 'var(--dim)', opacity: 0.7 }}>Größe</div>
          <input
            type="number" value={heightCm || ''} min={120} max={230}
            onChange={e => setHeightCm(Number(e.target.value))}
            className={inputCls}
          />
          <div className="text-xs ml-1 mt-1" style={{ color: 'var(--dim)', opacity: 0.5 }}>cm</div>
        </div>

        <div>
          <div className="text-xs font-medium mb-2 ml-1" style={{ color: 'var(--dim)', opacity: 0.7 }}>Gewicht</div>
          <input
            type="number" value={weightKg || ''} min={30} max={300} step={0.5}
            onChange={e => setWeightKg(Number(e.target.value))}
            className={inputCls}
          />
          <div className="text-xs ml-1 mt-1" style={{ color: 'var(--dim)', opacity: 0.5 }}>kg</div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !displayName.trim()}
        className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-3 bg-fit-accent text-white rounded-xl font-semibold text-xs hover:opacity-90 disabled:opacity-50 transition-all"
      >
        {saving ? (
          <span className="animate-pulse">Speichert in Cloud…</span>
        ) : saved ? (
          <>
            <Check size={14} /> Cloud synchronisiert
          </>
        ) : (
          <>
            <Save size={14} /> Profil &amp; Daten speichern
          </>
        )}
      </button>
    </section>
  );
}
