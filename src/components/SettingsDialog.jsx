import React, { useEffect, useState } from 'react';
import { Icon } from './Icons.jsx';
import { Field, Select, TextInput, Toggle } from './ui/Controls.jsx';
import {
  ACTION_ORDER, ACTIONS, PLACEHOLDERS, isCustomised,
} from '../lib/prompts.js';

const TINTS = [
  { id: 'ivory', label: 'Ivory', swatch: '#FBF6EA' },
  { id: 'snow', label: 'Snow', swatch: '#FCFCFD' },
  { id: 'sepia', label: 'Sepia', swatch: '#F3E7CE' },
  { id: 'slate', label: 'Slate', swatch: '#232830' },
];

const FORMAT_ROWS = [
  ['DOCX / DOCM', 'open, edit, save', 'Word documents, round-tripped through the editor'],
  ['FLECT (.flect)', 'open, edit, save', 'Native package: HTML plus page settings'],
  ['Markdown (.md)', 'open, edit, save', 'GitHub-flavoured, tables preserved'],
  ['Plain text (.txt)', 'open, edit, save', 'Paragraphs separated by blank lines'],
  ['HTML (.html)', 'open, edit, save', 'Standalone page with type styles'],
  ['Rich Text (.rtf)', 'open (basic), save', 'Text, paragraphs and emphasis'],
  ['PDF', 'export', 'Print-quality, A4 or Letter, page numbers'],
  ['EPUB (.epub)', 'export', 'EPUB 3, one spine item per level-1 heading'],
];

const SHORTCUTS = [
  ['Ctrl + S', 'Save'], ['Ctrl + Shift + S', 'Save as'], ['Ctrl + O', 'Open'],
  ['Ctrl + N', 'New document'], ['Ctrl + F', 'Find and replace'], ['Ctrl + K', 'Insert link'],
  ['Ctrl + P', 'Export PDF'], ['Ctrl + ,', 'Settings'], ['Ctrl + 0 / +/-', 'Zoom'],
  ['R', 'Rephrase selection'], ['G', 'Grammar and spelling'], ['P', 'Punctuation'],
  ['L', 'Split long sentences'], ['C', 'Custom instruction'], ['Esc', 'Dismiss'],
];

export default function SettingsDialog({ open, settings, appInfo, onClose, onSave }) {
  const [tab, setTab] = useState('ai');
  const [draft, setDraft] = useState(settings);
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState('');
  const [testing, setTesting] = useState(false);
  const [promptTab, setPromptTab] = useState('R');

  useEffect(() => {
    if (open) {
      setDraft(JSON.parse(JSON.stringify(settings)));
      setFetchMsg('');
      setModels([]);
      setTab('ai');
    }
  }, [open, settings]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = (group, key, value) => setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: value } }));

  const fetchModels = async () => {
    setFetching(true);
    setFetchMsg('');
    try {
      const res = await window.flect.ai.models({ baseUrl: draft.ai.baseUrl, apiKey: draft.ai.apiKey });
      if (res.ok) {
        setModels(res.models);
        setFetchMsg(`${res.models.length} models found`);
        if (!draft.ai.model && res.models.length) set('ai', 'model', res.models[0]);
      } else {
        setFetchMsg(res.error || 'Could not list models');
      }
    } catch (err) {
      setFetchMsg(err.message);
    } finally {
      setFetching(false);
    }
  };

  const testModel = async () => {
    setTesting(true);
    setFetchMsg('');
    try {
      await window.flect.ai.chat({
        id: `test-${Date.now()}`,
        baseUrl: draft.ai.baseUrl,
        apiKey: draft.ai.apiKey,
        model: draft.ai.model,
        messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
        temperature: 0,
        maxTokens: 12,
      });
      setFetchMsg('Connection works.');
    } catch (err) {
      setFetchMsg(err.message);
    } finally {
      setTesting(false);
    }
  };

  const setPrompt = (action, field, value) => setDraft((d) => ({
    ...d,
    prompts: {
      ...(d.prompts || {}),
      [action]: { ...(d.prompts?.[action] || {}), [field]: value },
    },
  }));

  const resetPrompt = (action) => setDraft((d) => {
    const prompts = { ...(d.prompts || {}) };
    delete prompts[action];
    return { ...d, prompts };
  });

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <aside className="modal__side">
          <h2 className="modal__title">Settings</h2>
          {[
            ['ai', 'AI provider', 'sparkle'],
            ['prompts', 'Prompts', 'wand'],
            ['writing', 'Writing page', 'type'],
            ['editor', 'Editor', 'pen'],
            ['formats', 'File formats', 'doc'],
            ['keys', 'Shortcuts', 'info'],
          ].map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              className={`modal__tab${tab === id ? ' is-on' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon name={icon} size={15} />
              <span>{label}</span>
            </button>
          ))}
          <div className="modal__side-foot">
            <span>FLECT {appInfo?.version || ''}</span>
          </div>
        </aside>

        <div className="modal__main">
          <header className="modal__head">
            <div>
              <h3>{{
                ai: 'AI provider', prompts: 'Prompts', writing: 'Writing page', editor: 'Editor',
                formats: 'File formats', keys: 'Keyboard',
              }[tab]}</h3>
              <p>{{
                ai: 'Any OpenAI-compatible endpoint: OpenAI, OpenRouter, Groq, DeepSeek, Ollama, LM Studio, vLLM.',
                prompts: 'The instructions behind R, G, P, L and C. Edit freely; reset any key to the shipped default.',
                writing: 'How the sheet looks while you write, and how it prints.',
                editor: 'Behaviour that changes how FLECT feels under the hand.',
                formats: 'What FLECT opens and what it writes.',
                keys: 'Every accelerator in the app.',
              }[tab]}</p>
            </div>
            <button type="button" className="modal__close" onClick={onClose} title="Close">
              <Icon name="close" size={16} />
            </button>
          </header>

          <div className="modal__body">
            {tab === 'ai' && (
              <div className="form">
                <Field label="Base URL" hint="OpenAI-compatible root, e.g. https://api.openai.com/v1">
                  <TextInput
                    value={draft.ai.baseUrl}
                    onChange={(v) => set('ai', 'baseUrl', v)}
                    placeholder="https://api.openai.com/v1"
                    monospace
                  />
                </Field>
                <Field label="API key" hint="Encrypted with the Windows credential store">
                  <div className="form__row">
                    <TextInput
                      value={draft.ai.apiKey}
                      onChange={(v) => set('ai', 'apiKey', v)}
                      placeholder="sk-…"
                      type={showKey ? 'text' : 'password'}
                      monospace
                    />
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowKey((v) => !v)}>
                      {showKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </Field>
                <Field label="Model" hint={fetchMsg || 'Fetch the list, or type a model id'}>
                  <div className="form__row">
                    {models.length ? (
                      <Select
                        value={draft.ai.model}
                        onChange={(v) => set('ai', 'model', v)}
                        options={models.map((m) => ({ value: m, label: m }))}
                        width="100%"
                        placeholder="Choose a model"
                      />
                    ) : (
                      <TextInput
                        value={draft.ai.model}
                        onChange={(v) => set('ai', 'model', v)}
                        placeholder="gpt-4o-mini"
                        monospace
                      />
                    )}
                    <button type="button" className="btn btn--ghost btn--sm" onClick={fetchModels} disabled={fetching}>
                      {fetching ? 'Fetching…' : 'Fetch models'}
                    </button>
                  </div>
                </Field>
                <Field
                  label="API shape"
                  hint="Auto follows OpenCode Go's per-model endpoint table"
                >
                  <Select
                    value={draft.ai.shape || 'auto'}
                    onChange={(v) => set('ai', 'shape', v)}
                    width="100%"
                    options={[
                      { value: 'auto', label: 'Auto-detect (recommended)' },
                      { value: 'chat', label: 'OpenAI chat completions' },
                      { value: 'messages', label: 'Anthropic messages' },
                      { value: 'responses', label: 'OpenAI responses' },
                    ]}
                  />
                </Field>
                <div className="form__actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={testModel} disabled={testing || !draft.ai.model}>
                    {testing ? 'Testing…' : 'Test connection'}
                  </button>
                  <p className="form__note">
                    Your manuscript text is sent only to the endpoint you configure here. Nothing passes through
                    a FLECT server, because there isn&apos;t one. OpenCode Go is supported directly: the base URL
                    <code> https://opencode.ai/zen/go/v1</code> works, and every request carries a stable
                    <code> x-opencode-session</code> header with a FLECT user agent.
                  </p>
                </div>
              </div>
            )}

            {tab === 'prompts' && (
              <div className="prompts">
                <p className="form__note">
                  Placeholders you can use:
                  {PLACEHOLDERS.map((p) => (
                    <span key={p.token} className="prompts__ph">
                      <code>{p.token}</code> {p.meaning}
                    </span>
                  ))}
                </p>
                <div className="prompts__body">
                  <div className="prompts__tabs">
                    {ACTION_ORDER.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={`prompts__tab${promptTab === id ? ' is-on' : ''}`}
                        onClick={() => setPromptTab(id)}
                      >
                        <kbd>{id}</kbd>
                        <span className="prompts__tablabel">{ACTIONS[id].label}</span>
                        {isCustomised(draft.prompts, id) && <span className="prompts__dot" title="Customised" />}
                      </button>
                    ))}
                  </div>
                  <div className="prompts__pane">
                    <Field label="Task prompt" hint="Sent as the user message">
                      <textarea
                        className="prompts__area"
                        rows={9}
                        spellCheck={false}
                        value={draft.prompts?.[promptTab]?.task ?? ACTIONS[promptTab].task}
                        onChange={(e) => setPrompt(promptTab, 'task', e.target.value)}
                      />
                    </Field>
                    <Field label="System prompt" hint="Voice, rules and bans">
                      <textarea
                        className="prompts__area prompts__area--sys"
                        rows={6}
                        spellCheck={false}
                        value={draft.prompts?.[promptTab]?.system ?? ACTIONS[promptTab].system}
                        onChange={(e) => setPrompt(promptTab, 'system', e.target.value)}
                      />
                    </Field>
                    <div className="prompts__foot">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => resetPrompt(promptTab)}>
                        Reset {ACTIONS[promptTab].label}
                      </button>
                      <span className="form__note">
                        Emptying a box falls back to the shipped prompt for that half.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'writing' && (
              <div className="form">
                <div className="form__grid">
                  <Field label="Paper">
                    <Select
                      value={draft.page.size}
                      onChange={(v) => set('page', 'size', v)}
                      options={[{ value: 'A4', label: 'A4 · 210 × 297 mm' }, { value: 'Letter', label: 'Letter · 8.5 × 11 in' }]}
                      width="100%"
                    />
                  </Field>
                  <Field label="Margin" hint="inches">
                    <Select
                      value={String(draft.page.margin)}
                      onChange={(v) => set('page', 'margin', Number(v))}
                      options={['0.5', '0.75', '1', '1.25', '1.5'].map((v) => ({ value: v, label: `${v}″` }))}
                      width="100%"
                    />
                  </Field>
                  <Field label="Typeface">
                    <Select
                      value={draft.page.font}
                      onChange={(v) => set('page', 'font', v)}
                      options={['Palatino Linotype', 'Georgia', 'Garamond', 'Book Antiqua', 'Cambria',
                        'Times New Roman', 'Iowan Old Style', 'Baskerville', 'Constantia', 'Segoe UI', 'Calibri']
                        .map((f) => ({ value: f, label: f, style: { fontFamily: f } }))}
                      width="100%"
                    />
                  </Field>
                  <Field label="Size" hint="points">
                    <Select
                      value={String(draft.page.fontSize)}
                      onChange={(v) => set('page', 'fontSize', Number(v))}
                      options={[10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 16].map((v) => ({ value: String(v), label: String(v) }))}
                      width="100%"
                    />
                  </Field>
                  <Field label="Line height">
                    <Select
                      value={String(draft.page.lineHeight)}
                      onChange={(v) => set('page', 'lineHeight', Number(v))}
                      options={['1.15', '1.3', '1.5', '1.65', '1.8', '2'].map((v) => ({ value: v, label: v }))}
                      width="100%"
                    />
                  </Field>
                  <Field label="First-line indent">
                    <Select
                      value={String(draft.page.indent)}
                      onChange={(v) => set('page', 'indent', Number(v))}
                      options={[{ value: '0', label: 'None' }, { value: '0.25', label: '0.25″' }, { value: '0.3', label: '0.3″' }, { value: '0.5', label: '0.5″' }]}
                      width="100%"
                    />
                  </Field>
                </div>
                <Field label="Gap between paragraphs" hint="em">
                  <Select
                    value={String(draft.page.spaceAfter)}
                    onChange={(v) => set('page', 'spaceAfter', Number(v))}
                    options={[{ value: '0', label: 'None' }, { value: '0.25', label: '0.25' }, { value: '0.5', label: '0.5' }, { value: '0.75', label: '0.75' }]}
                    width="220px"
                  />
                </Field>
                <Field label="Paper tint">
                  <div className="tint-row">
                    {TINTS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`tint${draft.page.tint === t.id ? ' is-on' : ''}`}
                        onClick={() => set('page', 'tint', t.id)}
                      >
                        <span className="tint__swatch" style={{ background: t.swatch }} />
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="form__divider" />
                <Toggle
                  checked={draft.page.justify}
                  onChange={(v) => set('page', 'justify', v)}
                  label="Justify body text"
                  hint="Hyphenation stays off, so rivers stay visible."
                />
              </div>
            )}

            {tab === 'editor' && (
              <div className="form">
                <Toggle
                  checked={draft.editor.aiBareKeys}
                  onChange={(v) => set('editor', 'aiBareKeys', v)}
                  label="Bare-key AI shortcuts"
                  hint="R, G, P, L and C act on a selection without a modifier. Turn this off to require Alt."
                />
                <Toggle
                  checked={draft.editor.spellcheck}
                  onChange={(v) => set('editor', 'spellcheck', v)}
                  label="Spellcheck as you type"
                  hint="Windows spellchecker, with right-click suggestions."
                />
                <Toggle
                  checked={draft.editor.autosave}
                  onChange={(v) => set('editor', 'autosave', v)}
                  label="Keep a recovery copy"
                  hint="A snapshot of the open text is written every few seconds, so a crash costs nothing."
                />
                <Toggle
                  checked={draft.editor.typewriter}
                  onChange={(v) => set('editor', 'typewriter', v)}
                  label="Typewriter scrolling"
                  hint="Keeps the caret near the middle of the screen."
                />
                <div className="form__divider" />
                <p className="form__note">
                  Undo history is kept for the whole session, six thousand steps deep. Saving never clears it, and
                  no AI suggestion reaches the page until you press Confirm.
                </p>
              </div>
            )}

            {tab === 'formats' && (
              <div className="format-table">
                <div className="format-table__head">
                  <span>Format</span><span>Action</span><span>Notes</span>
                </div>
                {FORMAT_ROWS.map(([name, action, note]) => (
                  <div className="format-table__row" key={name}>
                    <span className="format-table__name">{name}</span>
                    <span className="format-table__action">{action}</span>
                    <span className="format-table__note">{note}</span>
                  </div>
                ))}
                <p className="form__note">
                  DOCX and RTF are re-generated from the editor&apos;s own model, which keeps text, structure,
                  emphasis, alignment, lists, tables and images. Word features outside that set (tracked changes,
                  fields, macros) do not survive the round trip.
                </p>
              </div>
            )}

            {tab === 'keys' && (
              <div className="keys">
                {SHORTCUTS.map(([k, v]) => (
                  <div className="keys__row" key={k}>
                    <kbd>{k}</kbd>
                    <span>{v}</span>
                  </div>
                ))}
                <p className="form__note">
                  The five AI keys only fire when text is selected and the AI panel is closed, so ordinary typing
                  over a selection is never intercepted while you write.
                </p>
              </div>
            )}
          </div>

          <footer className="modal__foot">
            <div className="modal__foot-left">
              {appInfo && <span className="modal__meta">Electron {appInfo.electron} · Windows</span>}
            </div>
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn--gold" onClick={() => onSave(draft)}>Save settings</button>
          </footer>
        </div>
      </div>
    </div>
  );
}
