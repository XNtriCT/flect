'use strict';

/**
 * Wire-protocol routing for chat providers.
 *
 * OpenCode Go exposes three shapes from one base URL and documents which
 * model speaks which. Everything else (OpenAI, OpenRouter, Groq, DeepSeek,
 * Ollama, LM Studio, vLLM) speaks chat completions.
 */

const ANTHROPIC_SHAPED = new Set([
  'minimax-m3', 'minimax-m2.7', 'qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus',
]);

const RESPONSES_SHAPED = new Set([
  'grok-4.7', 'grok-4.6', 'gpt-6-luna', 'gpt-5.6-luna',
  'muse-spark-1.3-contributor', 'muse-spark-1.2-contributor',
]);

const SHAPES = new Set(['auto', 'chat', 'messages', 'responses']);

function normalizeModel(model) {
  return String(model || '').trim().replace(/^opencode-go\//i, '');
}

function hostOf(input) {
  try {
    const raw = /^https?:\/\//i.test(input || '') ? input : `https://${input || ''}`;
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isOpenCodeHost(baseUrl) {
  const host = hostOf(baseUrl);
  return host === 'opencode.ai' || host.endsWith('.opencode.ai');
}

function pickShape(baseUrl, model, override) {
  if (override === 'chat' || override === 'messages' || override === 'responses') return override;
  if (isOpenCodeHost(baseUrl)) {
    const id = normalizeModel(model).toLowerCase();
    if (ANTHROPIC_SHAPED.has(id)) return 'messages';
    if (RESPONSES_SHAPED.has(id)) return 'responses';
  }
  return 'chat';
}

function endpointFor(shape, root) {
  if (shape === 'messages') return `${root}/messages`;
  if (shape === 'responses') return `${root}/responses`;
  return `${root}/chat/completions`;
}

module.exports = {
  ANTHROPIC_SHAPED,
  RESPONSES_SHAPED,
  SHAPES,
  normalizeModel,
  hostOf,
  isOpenCodeHost,
  pickShape,
  endpointFor,
};
