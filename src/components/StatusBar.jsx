import React from 'react';
import { Icon } from './Icons.jsx';

const nf = new Intl.NumberFormat('en-US');

export default function StatusBar({ stats, doc, model, aiReady, selectionWords, onOpenSettings, zoom, onZoom }) {
  return (
    <footer className="statusbar">
      <div className="statusbar__group">
        <span className="statusbar__stat" title="Word count">
          <span className="statusbar__num">{nf.format(stats.words)}</span> words
        </span>
        <span className="statusbar__stat" title="Character count">
          <span className="statusbar__num">{nf.format(stats.chars)}</span> chars
        </span>
        {stats.words > 0 && (
          <span className="statusbar__stat statusbar__stat--dim">{stats.readMinutes} min read</span>
        )}
        {selectionWords > 0 && (
          <span className="statusbar__sel">
            <span className="statusbar__seldot" />
            {nf.format(selectionWords)} selected
          </span>
        )}
      </div>

      <div className="statusbar__group statusbar__group--mid">
        {selectionWords > 0 && (
          <span className="statusbar__hint">
            <kbd>R</kbd> rephrase <kbd>G</kbd> grammar <kbd>P</kbd> punctuation <kbd>L</kbd> split <kbd>C</kbd> custom
          </span>
        )}
      </div>

      <div className="statusbar__group statusbar__group--right">
        <span className="statusbar__format">{(doc.ext || 'flect').toUpperCase()}</span>
        <button
          type="button"
          className={`statusbar__model${aiReady ? ' is-ready' : ''}`}
          onClick={onOpenSettings}
          title={aiReady ? `Model: ${model}` : 'Connect an AI provider'}
        >
          <span className="statusbar__dot" />
          <span className="statusbar__modelname">{aiReady ? model : 'No model'}</span>
        </button>
        <span className="statusbar__zoom">
          <button type="button" onClick={() => onZoom(-0.1)} title="Zoom out">
            <Icon name="zoomOut" size={13} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => onZoom(0.1)} title="Zoom in">
            <Icon name="zoomIn" size={13} />
          </button>
        </span>
      </div>
    </footer>
  );
}
