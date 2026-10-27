import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { ACTIONS, buildMessages, parseAlternatives, sweepDashes, countDashes } from '../lib/prompts.js';

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toInsertable(text, block) {
  const body = String(text).replace(/\r\n?/g, '\n').trim();
  const lines = body.split('\n').map(escapeHtml);
  if (block) {
    return body.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
  }
  return lines.join('<br>');
}

function trimModelOutput(text) {
  return String(text || '')
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```\s*$/i, '')
    .replace(/^(?:here (?:is|are)[^\n]*|sure[,.]?[^\n]*)\n+/i, '')
    .trim();
}

export default function AIPopup({ state, settings, prompts, editor, onClose, onApplied, onOpenSettings }) {
  const { action, from, to, text, context, coords, block } = state;
  const spec = ACTIONS[action];

  const [raw, setRaw] = useState('');
  const [alts, setAlts] = useState([]);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [phase, setPhase] = useState(action === 'C' ? 'brief' : 'running');
  const [placement, setPlacement] = useState({ left: 0, top: 0, width: 500 });
  const [note, setNote] = useState('');
  const [rev, setRev] = useState(0);
  const [seed, setSeed] = useState('');

  const popRef = useRef(null);
  const areaRef = useRef(null);
  const idRef = useRef(null);
  const rawRef = useRef('');

  const configured = !!(settings?.ai?.baseUrl && settings?.ai?.apiKey && settings?.ai?.model);

  /* ---------------------------------------------------------------- */
  /* positioning                                                      */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    const el = popRef.current;
    if (!el) return;
    const width = Math.min(520, window.innerWidth - 32);
    const height = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = coords.left - 40;
    left = Math.max(16, Math.min(left, vw - width - 16));
    let top = coords.bottom + 12;
    if (top + height > vh - 16) {
      top = Math.max(16, coords.top - height - 12);
    }
    setPlacement({ left, top, width });
  }, [coords, phase, alts.length, error, busy]);

  /* ---------------------------------------------------------------- */
  /* streaming                                                        */
  /* ---------------------------------------------------------------- */
  const startRequest = useCallback(async (sel) => {
    if (!configured) { setPhase('unconfigured'); return; }
    const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    idRef.current = id;
    rawRef.current = '';
    setBusy(true);
    setError('');
    setRaw('');
    setAlts([]);
    setResult('');
    setPhase('running');

    window.flect.ai.chat({
      id,
      baseUrl: settings.ai.baseUrl,
      apiKey: settings.ai.apiKey,
      model: settings.ai.model,
      messages: buildMessages(action, sel, prompts),
      temperature: spec.temperature,
      maxTokens: spec.maxTokens(sel.text.length),
    }).catch((err) => {
      if (idRef.current === id) {
        setBusy(false);
        setError(err?.message || 'The request failed.');
      }
    });
  }, [action, configured, settings, spec, prompts]);

  useEffect(() => {
    let cancelled = false;
    const unsub = window.flect.ai.onEvent((ev) => {
      if (ev.id !== idRef.current) return;
      if (ev.type === 'chunk') {
        rawRef.current += ev.text;
        setRaw(rawRef.current);
      } else if (ev.type === 'done') {
        setBusy(false);
        const full = trimModelOutput(ev.text || rawRef.current);
        if (action === 'R') {
          const list = parseAlternatives(full);
          if (list.length) { setAlts(list); setPhase('review'); }
          else setError('The model returned no usable alternatives. Try again, or use Custom instructions.');
        } else {
          let out = full;
          if (action === 'P' && countDashes(out) > 0) {
            out = sweepDashes(out);
            setNote('Dashes were still present, so they were converted automatically. Check the commas.');
          }
          setResult(out);
          setSeed(out);
          setRev((r) => r + 1);
          setPhase('review');
        }
      } else if (ev.type === 'error') {
        setBusy(false);
        setError(ev.message || 'The provider returned an error.');
      } else if (ev.type === 'cancelled') {
        setBusy(false);
      }
    });
    return () => {
      cancelled = true;
      unsub();
      if (idRef.current) window.flect.ai.cancel(idRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  /* kick off non-custom actions on mount */
  useEffect(() => {
    if (action !== 'C') startRequest({ text, context, full: block });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Size and focus the canvas when the review step opens. It must not run on
  // every keystroke: resizing and re-setting the selection mid-typing can
  // swallow characters in a controlled textarea.
  useEffect(() => {
    if (phase !== 'review') return;
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(360, Math.max(96, el.scrollHeight + 4))}px`;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [phase]);

  const currentDraft = () => (areaRef.current ? areaRef.current.value : result);

  const apply = useCallback((value) => {
    const clean = String(value || '').trim();
    if (!clean) return;
    const html = toInsertable(clean, block);
    editor.chain().focus().insertContentAt({ from, to }, html).run();
    onApplied?.({
      action,
      label: spec.label,
      from: text,
      to: clean,
      at: Date.now(),
      model: settings.ai.model,
    });
    onClose();
  }, [action, block, editor, from, to, onApplied, onClose, settings.ai.model, spec.label, text]);

  const retry = () => startRequest({ text, context, instruction, full: block });

  const sendCustom = () => {
    if (!instruction.trim()) return;
    startRequest({ text, context, instruction: instruction.trim(), full: block });
  };

  const keydown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    const typing = /^(INPUT|TEXTAREA)$/.test(e.target?.tagName || '');
    if (!typing && phase === 'review' && action === 'R' && alts.length) {
      const n = Number(e.key);
      if (n >= 1 && n <= alts.length) {
        e.preventDefault();
        apply(alts[n - 1]);
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      if (phase === 'review' && action !== 'R') { e.preventDefault(); apply(currentDraft()); }
      if (phase === 'brief') { e.preventDefault(); sendCustom(); }
    }
  };

  const modelLabel = settings?.ai?.model || 'no model';
  const charDelta = useMemo(() => (result ? result.length - text.length : 0), [result, text.length]);

  return (
    <>
      <div className="ai-scrim" onMouseDown={onClose} />
      <div
        className="ai-pop"
        ref={popRef}
        style={{ left: placement.left, top: placement.top, width: placement.width }}
        onKeyDown={keydown}
        role="dialog"
        aria-label={`${spec.label} suggestions`}
      >
        <header className="ai-pop__head">
          <span className="ai-pop__badge">{spec.key}</span>
          <div className="ai-pop__titles">
            <h3>{spec.label}</h3>
            <p>{spec.hint}</p>
          </div>
          <span className="ai-pop__model" title={modelLabel}>{modelLabel}</span>
          <button type="button" className="ai-pop__close" onClick={onClose} title="Close (Esc)">
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="ai-pop__orig" title="The text being revised">
          <span className="ai-pop__origlabel">Selection</span>
          <p>{text.length > 220 ? `${text.slice(0, 220).trimEnd()}…` : text}</p>
        </div>
        <div className="ai-pop__body">
          {phase === 'unconfigured' && (
            <div className="ai-state">
              <Icon name="sparkle" size={22} />
              <p><strong>No model connected yet.</strong></p>
              <p className="ai-state__dim">Add a base URL, an API key and choose a model. FLECT works with any OpenAI-compatible provider.</p>
              <button type="button" className="btn btn--gold" onClick={onOpenSettings}>Open AI settings</button>
            </div>
          )}

          {phase === 'brief' && (
            <div className="ai-brief">
              <label className="ai-brief__label" htmlFor="ai-instruction">What should change?</label>
              <textarea
                id="ai-instruction"
                ref={areaRef}
                className="ai-canvas ai-canvas--brief"
                placeholder="Trim this to one sentence. Keep the salt smell. Make the last clause land harder."
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendCustom(); }}
                spellCheck={false}
                rows={3}
              />
              <div className="ai-brief__row">
                <span className="ai-hint">The selection and its paragraph travel with your instruction.</span>
                <button type="button" className="btn btn--gold" disabled={!instruction.trim()} onClick={sendCustom}>
                  <Icon name="arrowRight" size={14} /> Send
                </button>
              </div>
            </div>
          )}

          {(phase === 'running' || (phase === 'review' && action === 'R' && !alts.length)) && (
            <div className="ai-stream">
              {raw
                ? <p className="ai-stream__text">{raw}</p>
                : (
                  <div className="ai-thinking">
                    <span className="ai-thinking__dot" />
                    <span className="ai-thinking__dot" />
                    <span className="ai-thinking__dot" />
                    <span className="ai-thinking__label">Reading the line…</span>
                  </div>
                )}
            </div>
          )}

          {error && (
            <div className="ai-error">
              <Icon name="info" size={15} />
              <div>
                <p>{error}</p>
                <div className="ai-error__row">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={retry}>Try again</button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={onOpenSettings}>Check settings</button>
                </div>
              </div>
            </div>
          )}

          {phase === 'review' && action === 'R' && alts.length > 0 && (
            <ol className="ai-alts">
              {alts.map((alt, i) => (
                <li key={i}>
                  <button type="button" className="ai-alt" onClick={() => apply(alt)}>
                    <span className="ai-alt__num">{i + 1}</span>
                    <span className="ai-alt__text">{alt}</span>
                    <span className="ai-alt__use">Use</span>
                  </button>
                </li>
              ))}
            </ol>
          )}

          {phase === 'review' && action !== 'R' && (
            <div className="ai-review">
              <textarea
                key={rev}
                ref={areaRef}
                className="ai-canvas"
                defaultValue={seed}
                onChange={(e) => setResult(e.target.value)}
                spellCheck
                aria-label="Revised text"
              />
              {note && <p className="ai-note">{note}</p>}
              <div className="ai-meta">
                <span>{result.trim().split(/\s+/).filter(Boolean).length} words</span>
                <span className={charDelta > 0 ? 'is-up' : charDelta < 0 ? 'is-down' : ''}>
                  {charDelta > 0 ? '+' : ''}{charDelta} characters
                </span>
              </div>
            </div>
          )}
        </div>

        <footer className="ai-pop__foot">
          <div className="ai-pop__hints">
            <kbd>Esc</kbd> close
            {action === 'R' && phase === 'review' && <><kbd>1</kbd>–<kbd>5</kbd> choose</>}
            {phase === 'review' && action !== 'R' && <><kbd>Ctrl</kbd><kbd>↵</kbd> confirm</>}
            {phase === 'brief' && <><kbd>Ctrl</kbd><kbd>↵</kbd> send</>}
          </div>
          <div className="ai-pop__actions">
            {(phase === 'review' || phase === 'running') && action !== 'C' && (
              <button type="button" className="btn btn--ghost" onClick={retry} disabled={busy}>
                <Icon name="refresh" size={14} /> Regenerate
              </button>
            )}
            {phase === 'review' && action !== 'R' && (
              <>
                <button type="button" className="btn btn--ghost" onClick={() => navigator.clipboard.writeText(currentDraft())}>
                  <Icon name="copy" size={14} /> Copy
                </button>
                <button type="button" className="btn btn--gold" onClick={() => apply(currentDraft())}>
                  <Icon name="check" size={14} /> Confirm
                </button>
              </>
            )}
            {phase === 'running' && (
              <button type="button" className="btn btn--ghost" onClick={() => { window.flect.ai.cancel(idRef.current); setBusy(false); onClose(); }}>
                Stop
              </button>
            )}
          </div>
        </footer>
      </div>
    </>
  );
}
