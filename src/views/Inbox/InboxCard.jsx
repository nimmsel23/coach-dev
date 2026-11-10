import { sourceIds } from '../../lib/db/shared/catalogSources.js';
import { CheckCircle2, Trash2, Info, AlertTriangle, Sparkles, User, RefreshCw, MessageSquare, Brain, ExternalLink } from 'lucide-react';

function sourceRefs(data) {
  return { wger: sourceIds(data, 'wger'), yuhonas: sourceIds(data, 'yuhonas') };
}

function buildInspectPayload(ex, data) {
  return {
    ...ex,
    ...data,
    file_id: ex.file_id || data.file_id || null,
    userId: ex.userId || data.userId || null,
    status: ex.status || data.status || null,
    inbox_status: ex.status || data.status || null,
    coachFeedback: ex.coachFeedback || ex.feedback || data.coachFeedback || data.feedback || '',
    inbox_entry: ex,
    enriched: ex.enriched || data.enriched || null,
  };
}

function asText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(' ').trim();
  return String(value || '').trim();
}

/** Zwei Sätze für die Review-Karte — Beschreibung, sonst Original/Instructions. */
function twoSentenceWhat(data) {
  const raw = asText(
    data.description
    || data.original_description
    || data.instructions
    || data.trainer_explanation?.simple
    || data.trainer_explanation?.client_friendly,
  );
  if (!raw) return 'Noch keine Kurzbeschreibung — Details öffnen oder Verbessern.';
  const parts = raw.split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.slice(0, 2).join(' ');
}

function coachingHighlights(data, limit = 3) {
  const notes = Array.isArray(data.coaching_notes) ? data.coaching_notes : [];
  return notes.map(asText).filter(Boolean).slice(0, limit);
}

/** Herkunft als ein Text; Quelleneditor bleibt im Detail-Modal. */
function originLine(data, refs) {
  const bits = [];
  if (refs.wger.length) bits.push(`wger ${refs.wger.join(', ')}`);
  if (refs.yuhonas.length) bits.push(`yuhonas ${refs.yuhonas.join(', ')}`);
  const originLabel = asText(
    typeof data.origin === 'string'
      ? data.origin
      : data.origin?.label || data.origin?.name || data.source,
  );
  if (originLabel && !bits.some((bit) => bit.includes(originLabel))) bits.unshift(originLabel);
  if (data.source_review_required) bits.push('Quellenkorrektur — KI-Inhalt erneut prüfen');
  if (!bits.length) return 'Herkunft unklar — unter Details zuordnen';
  return bits.join(' · ');
}

export default function InboxCard({ ex, actioning, onApprove, onDelete, onReenrich, onInspect, mergeCandidate, showUserId = false, asMessage = false }) {
  // Unterstützt beide Backend-Shapes: { exercises: [data] } und { enriched: data } und flach
  const data     = ex.exercises?.[0] || ex.enriched || ex;
  const fileId   = ex.file_id;
  const userId   = ex.userId || null;
  const warnings = data.biomechanical_warnings || [];
  const isProactive = ex.description?.toLowerCase().includes('proactively');
  const isPendingEnrichment = ex.status === 'pending' || ex.status === 'pending_review';
  const busy = actioning === fileId;
  const refs = sourceRefs(data);
  const highlights = coachingHighlights(data);
  const what = twoSentenceWhat(data);
  const origin = originLine(data, refs);
  const githubUrl = typeof ex.html_url === 'string' && ex.html_url.startsWith('https://') ? ex.html_url : null;
  const isGithubPr = Boolean(
    githubUrl && (ex.cache_source === 'github_pr' || String(fileId || '').startsWith('pr-')),
  );

  if (asMessage) {
    let icon = <MessageSquare className="text-fit-dim" size={20} />;
    let title = `Anfrage: ${data.display_name || data.name}`;
    let body = "Deine Übungsanfrage wurde erfasst.";
    let iconBg = "bg-fit-bg2";
    let iconColor = "text-fit-dim";

    if (ex.type === 'coach_feedback') {
      icon = <Brain className="text-fit-accent animate-pulse" size={20} />;
      title = ex.title || "Neues Coach-Feedback 💬";
      body = ex.text || "Dein Coach hat einen Kommentar hinterlassen.";
      iconBg = "bg-fit-accent/10";
      iconColor = "text-fit-accent";
    } else if (isPendingEnrichment) {
      icon = <RefreshCw className="animate-spin text-fit-orange" size={20} />;
      title = `Anfrage gesendet: ${data.display_name || data.name}`;
      body = "Die Übungsanfrage wurde registriert. Die KI analysiert nun die biomechanischen Details...";
      iconBg = "bg-fit-orange/10";
      iconColor = "text-fit-orange";
    } else if (ex.status === 'ai_enriched') {
      icon = <Sparkles className="text-fit-accent animate-pulse" size={20} />;
      title = `KI-Entwurf bereit: ${data.display_name || data.name}`;
      body = "Die KI hat die Übung angereichert. Sie wartet nun auf die Freigabe durch den Coach.";
      iconBg = "bg-fit-accent/10";
      iconColor = "text-fit-accent";
    } else if (ex.status === 'approved') {
      icon = <CheckCircle2 className="text-fit-green" size={20} />;
      title = `Übung freigegeben: ${data.display_name || data.name} 🎉`;
      body = "Dein Coach hat die Übung freigegeben! Sie steht dir ab sofort im Katalog zur Verfügung.";
      iconBg = "bg-fit-green/10";
      iconColor = "text-fit-green";
    } else if (ex.status === 'rejected') {
      icon = <AlertTriangle className="text-fit-red" size={20} />;
      title = `Anfrage abgelehnt: ${data.display_name || data.name}`;
      body = "Der Coach hat die Übung nicht freigegeben. Bei Fragen wende dich direkt an deinen Coach.";
      iconBg = "bg-fit-red/10";
      iconColor = "text-fit-red";
    }

    return (
      <div className="card p-5 flex items-center justify-between gap-4 hover:border-fit-line transition-all">
        <div className="flex items-center gap-4 min-w-0">
          <div className={`w-10 h-10 shrink-0 rounded-xl ${iconBg} ${iconColor} flex items-center justify-center`}>
            {icon}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-black text-fit-ink truncate">{title}</h4>
            <p className="text-xs text-fit-dim mt-0.5 leading-relaxed truncate md:line-clamp-2 md:whitespace-normal">
              {body}
            </p>
            {ex.received_at && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-fit-muted block mt-1">
                {new Date(ex.received_at.seconds ? ex.received_at.seconds * 1000 : ex.received_at).toLocaleDateString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {ex.status === 'approved' && (
            <button
              onClick={() => onInspect?.({ ...buildInspectPayload(ex, data), mergeCandidate })}
              className="p-2.5 bg-fit-bg2 text-fit-dim hover:text-ink rounded-lg border border-fit-line transition-all active:scale-95"
              title="Übung anzeigen"
            >
              <Info size={16} />
            </button>
          )}
          <button
            onClick={() => onDelete(fileId)}
            disabled={busy}
            className="p-2.5 bg-fit-red/5 text-fit-red hover:bg-red/10 rounded-lg border border-fit-red/10 transition-all active:scale-95 disabled:opacity-50"
            title="Löschen"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  }

  // Review-Karte: Entscheidungssurface statt 40-Felder-Editor (SourceEditor nur im Detail-Modal).
  return (
    <article className="card p-4 flex flex-col gap-3" aria-label={`Review ${data.display_name || data.name || 'Übung'}`}>
      {showUserId && userId && (
        <div className="flex items-center gap-2">
          <User size={12} className="text-fit-dim" />
          <span className="text-[10px] font-bold text-fit-dim uppercase tracking-widest">{userId}</span>
        </div>
      )}

      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-bold uppercase tracking-wide text-fit-ink leading-snug">
            {data.display_name || data.name}
          </h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {data.category && <span className="vos-tag shrink-0">{data.category}</span>}
            {!showUserId && (
              isProactive
                ? <span className="flex items-center gap-1 text-[9px] font-black px-2 py-0.5 bg-blue/10 text-blue rounded-full border border-blue/20 uppercase tracking-tighter"><Sparkles size={10} /> Proaktiv</span>
                : <span className="text-[9px] font-black px-2 py-0.5 bg-fit-green/10 text-fit-green rounded-full border border-fit-green/20 uppercase tracking-tighter">Klient</span>
            )}
            {isPendingEnrichment && (
              <span className="text-[9px] font-black px-2 py-0.5 bg-fit-orange/15 text-fit-orange rounded-full border border-fit-orange/25 uppercase tracking-tighter animate-pulse">
                Wartet auf KI
              </span>
            )}
            {ex.status === 'ai_enriched' && (
              <span className="text-[9px] font-black px-2 py-0.5 bg-fit-accent/15 text-fit-accent rounded-full border border-fit-accent/25 uppercase tracking-tighter">
                Freigabe offen
              </span>
            )}
            {ex.status === 'failed_enrichment' && (
              <span className="text-[9px] font-black px-2 py-0.5 bg-fit-red/15 text-fit-red rounded-full border border-fit-red/25 uppercase tracking-tighter">
                KI-Fehler
              </span>
            )}
            {mergeCandidate && (
              <span className="text-[9px] font-black px-2 py-0.5 bg-fit-bg2 rounded-full border border-fit-line text-fit-dim uppercase tracking-tighter">
                Merge-Vorschlag
              </span>
            )}
            {isGithubPr && (
              <span className="text-[9px] font-black px-2 py-0.5 bg-fit-bg2 rounded-full border border-fit-line text-fit-dim uppercase tracking-tighter">
                GitHub PR{ex.pr_number ? ` #${ex.pr_number}` : ''}
              </span>
            )}
          </div>
        </div>
      </header>

      <p className="text-xs text-fit-ink leading-relaxed">{what}</p>

      {data.primary_muscles?.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Primäre Muskeln">
          {data.primary_muscles.map((m) => (
            <span key={m} className="text-[9px] font-bold px-2 py-0.5 bg-fit-accent/5 text-fit-accent rounded-md border border-fit-accent/10">{m}</span>
          ))}
        </div>
      )}

      {highlights.length > 0 ? (
        <ul className="space-y-1.5 text-xs text-fit-dim leading-relaxed">
          {highlights.map((note, i) => (
            <li key={i} className="line-clamp-2">• {note.replace(/^\*\*[^*]+\*\*:?\s*/, '')}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fit-muted italic">Keine Coaching-Highlights — Verbessern oder Details.</p>
      )}

      <p className="text-[10px] font-semibold uppercase tracking-wide text-fit-muted">{origin}</p>

      {warnings.length > 0 && (
        <div className="p-3 bg-fit-red/5 border border-fit-red/10 rounded-xl space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-fit-red text-[10px] font-bold uppercase leading-tight">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <div className="vos-action-row mt-auto">
        {isGithubPr ? (
          <>
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="vos-btn go"
              title="PR auf GitHub öffnen"
            >
              <ExternalLink size={13} /> Auf GitHub öffnen
            </a>
            <button
              onClick={() => onInspect?.({ ...buildInspectPayload(ex, data), mergeCandidate })}
              className="vos-btn"
              title="Kurzvorschau"
            >
              <Info size={13} /> Details
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onInspect?.({ ...buildInspectPayload(ex, data), mergeCandidate })}
              className="vos-btn"
              title="Vollansicht / Quellen"
            >
              <Info size={13} /> Details
            </button>
            <button
              onClick={() => onDelete(fileId)}
              disabled={busy}
              className="vos-btn no"
              title="Löschen"
            >
              <Trash2 size={13} /> Löschen
            </button>
            {onReenrich && (
              <button
                onClick={() => onReenrich(fileId)}
                disabled={busy}
                className="vos-btn mid"
                title="Neu anreichern (Gemini)"
              >
                <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Verbessern
              </button>
            )}
            {onApprove && (
              <button
                onClick={() => onApprove(fileId)}
                disabled={busy}
                className="vos-btn go"
              >
                {busy ? 'Warte…' : <><CheckCircle2 size={13} /> Freigeben</>}
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
