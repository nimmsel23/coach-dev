import { useState } from "react";
import { createPortal } from "react-dom";
import { User, Copy, X, Settings2 } from "lucide-react";
import { useUser } from "../../contexts/UserContext.jsx";
import { useEscapeKey } from "../../hooks/useEscapeKey.js";

const inputCls = "w-full bg-fit-bg2 border border-fit-line rounded-xl px-3 py-2.5 text-sm font-bold text-fit-ink focus:border-fit-accent outline-none transition-colors"

export default function UserProfile({ user, subtitle, onOpenSettings }) {
  const [isOpen, setIsOpen] = useState(false);

  const {
    age,
    setAge,
    gender,
    setGender,
    heightCm,
    setHeightCm,
    weightKg,
    setWeightKg,
  } = useUser();

  // ESC schließt das Profil-Quickedit-Modal.
  useEscapeKey(() => setIsOpen(false), isOpen);

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className="p-4 rounded-2xl bg-fit-bg2 border border-fit-line hover:border-fit-accent/30 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-fit-accent/10 border border-fit-accent/20 flex items-center justify-center overflow-hidden transition-transform group-hover:scale-105">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User size={20} className="text-fit-accent" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-black text-fit-ink truncate group-hover:text-fit-accent transition-colors">
              {user?.displayName || "Client"}
            </div>
            <div className="text-[9px] font-bold text-fit-dim truncate opacity-50">
              {subtitle || user?.email}
            </div>
            <div className="text-[8px] font-mono text-fit-accent/70 truncate mt-0.5 tracking-wider">
              {age}J · {heightCm}cm · {weightKg}kg
            </div>
          </div>
        </div>
      </div>

      {isOpen && createPortal(
        <div
          className="fixed inset-0 bg-fit-scrim backdrop-blur-md z-[9999] flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-fit-card border border-fit-line rounded-[32px] p-8 w-full max-w-sm shadow-2xl relative flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-fit-bg2 border border-fit-line flex items-center justify-center text-fit-dim hover:text-fit-accent hover:border-fit-accent/20 transition-all active:scale-90"
            >
              <X size={14} />
            </button>

            <div className="w-20 h-20 rounded-full bg-fit-accent/5 border border-fit-accent/10 flex items-center justify-center overflow-hidden mb-4 shadow-xl">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User size={36} className="text-fit-accent" />
              )}
            </div>

            <h3 className="text-lg font-black text-fit-ink mb-1">{user?.displayName || "Client"}</h3>
            <p className="text-xs font-bold text-fit-dim uppercase tracking-wider mb-6">{user?.email || "Local User"}</p>

            {/* Profil-Quickedit */}
            <div className="w-full space-y-3 mb-6 text-left">
              {/* Geschlecht */}
              <div className="flex gap-1 p-1 bg-fit-bg2 rounded-xl border border-fit-line">
                {[{ id: 'm', label: 'Männlich' }, { id: 'f', label: 'Weiblich' }].map(({ id, label }) => (
                  <button key={id} onClick={() => setGender(id)}
                    className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${gender === id ? 'bg-fit-card shadow-md text-fit-accent' : 'text-fit-dim hover:text-fit-ink'}`}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[9px] font-black opacity-30 uppercase tracking-widest mb-1 ml-1">Alter</div>
                  <input type="number" value={age} min={15} max={99}
                    onChange={e => setAge(Number(e.target.value))}
                    className={inputCls} />
                  <div className="text-[8px] opacity-30 ml-1 mt-0.5">Jahre</div>
                </div>
                <div>
                  <div className="text-[9px] font-black opacity-30 uppercase tracking-widest mb-1 ml-1">Größe</div>
                  <input type="number" value={heightCm} min={120} max={230}
                    onChange={e => setHeightCm(Number(e.target.value))}
                    className={inputCls} />
                  <div className="text-[8px] opacity-30 ml-1 mt-0.5">cm</div>
                </div>
                <div>
                  <div className="text-[9px] font-black opacity-30 uppercase tracking-widest mb-1 ml-1">Gewicht</div>
                  <input type="number" value={weightKg} min={30} max={300} step={0.5}
                    onChange={e => setWeightKg(Number(e.target.value))}
                    className={inputCls} />
                  <div className="text-[8px] opacity-30 ml-1 mt-0.5">kg</div>
                </div>
              </div>

              {/* UID */}
              <div className="bg-fit-bg2 border border-fit-line rounded-2xl p-3">
                <div className="text-[9px] font-black text-fit-dim uppercase tracking-widest mb-1">UID</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-fit-accent/70 truncate select-all">{user?.uid || "default"}</span>
                  <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(user?.uid || "default"); }}
                    className="p-1.5 rounded-lg bg-fit-card border border-fit-line text-fit-dim hover:text-fit-accent transition-all flex-shrink-0">
                    <Copy size={11} />
                  </button>
                </div>
              </div>
            </div>

            <div className="w-full flex gap-2">
              {onOpenSettings && (
                <button
                  onClick={() => { setIsOpen(false); onOpenSettings() }}
                  className="flex-1 py-3 rounded-2xl bg-fit-bg2 border border-fit-line text-fit-dim font-black uppercase tracking-wider text-[10px] hover:border-fit-accent/30 hover:text-fit-accent transition-all flex items-center justify-center gap-2"
                >
                  <Settings2 size={13} /> Settings
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 py-3 rounded-2xl bg-fit-accent text-black font-black uppercase tracking-wider text-[10px] hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-lg shadow-fit-accent/15"
              >
                Fertig
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
