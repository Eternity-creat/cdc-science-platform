const BASE_URL = '/api';

function parseSseMessage(raw) {
  const event = { event: 'message', data: '' };

  raw.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith(':')) return;
    const index = line.indexOf(':');
    const field = index >= 0 ? line.slice(0, index) : line;
    const value = index >= 0 ? line.slice(index + 1).trimStart() : '';
    if (field === 'event') event.event = value || 'message';
    if (field === 'data') event.data += `${value}\n`;
  });

  event.data = event.data.replace(/\n$/, '');
  return event;
}

function extractChunk(data) {
  if (!data || data === '[DONE]') return '';

  try {
    const json = JSON.parse(data);
    return json.delta ?? json.content ?? json.text ?? json.data ?? json.result ?? '';
  } catch {
    return data;
  }
}

function extractFinalContent(data) {
  if (!data || data === '[DONE]') return null;

  try {
    const json = JSON.parse(data);
    if (typeof json.content === 'string') return json.content;
    if (typeof json.data === 'string') return json.data;
    if (typeof json.result === 'string') return json.result;
    return null;
  } catch {
    return data;
  }
}

export async function postEventStream(url, data, { onChunk, onMessage, signal } = {}) {
  const response = await fetch(`${BASE_URL}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal,
  });

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
    error.status = response.status;
    throw error;
  }

  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';
  let doneReceived = false;

  const handleMessage = async (message) => {
    onMessage?.(message);

    if (message.event === 'error') {
      let errorMessage = message.data || '流式生成失败';
      try {
        const json = JSON.parse(message.data);
        errorMessage = json.message || errorMessage;
      } catch {
        // keep raw error message
      }
      throw new Error(errorMessage);
    }

    if (message.event === 'replace' || message.event === 'done') {
      const finalContent = extractFinalContent(message.data);
      if (finalContent !== null) {
        fullText = finalContent;
        await onChunk?.(fullText, '');
      }
      if (message.event === 'done') doneReceived = true;
      return;
    }

    const chunk = extractChunk(message.data);
    if (chunk) {
      fullText += chunk;
      await onChunk?.(fullText, chunk);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    if (!/\r?\n\r?\n/.test(buffer)) continue;

    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || '';

    for (const part of parts) {
      if (!part.trim()) continue;
      await handleMessage(parseSseMessage(part));
      if (doneReceived) break;
    }

    if (doneReceived) {
      await reader.cancel().catch(() => {});
      break;
    }
  }

  const tail = decoder.decode();
  if (tail) buffer += tail;
  if (!doneReceived && buffer.trim()) {
    await handleMessage(parseSseMessage(buffer.trim()));
  }

  return fullText;
}

export async function streamWithFallback(streamUrl, fallbackRequest, { onChunk, onMessage, signal } = {}) {
  try {
    const streamed = await postEventStream(streamUrl, undefined, { onChunk, onMessage, signal });
    if (streamed) return streamed;
  } catch (error) {
    if (![404, 405, 501].includes(error.status)) throw error;
  }

  const result = await fallbackRequest();
  onChunk?.(result || '', result || '');
  return result;
}
