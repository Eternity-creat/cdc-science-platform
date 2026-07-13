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
  if (!data) return '';
  if (data === '[DONE]') return '';

  try {
    const json = JSON.parse(data);
    return json.delta ?? json.content ?? json.text ?? json.data ?? json.result ?? '';
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

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    if (!buffer.includes('\n\n')) continue;

    const parts = buffer.split(/\n\n/);
    buffer = parts.pop() || '';

    parts.forEach((part) => {
      const message = parseSseMessage(part);
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
      if (message.event === 'done') return;
      const chunk = extractChunk(message.data);
      if (chunk) {
        fullText += chunk;
        onChunk?.(fullText, chunk);
      }
    });
  }

  const tail = decoder.decode();
  if (tail) buffer += tail;
  const finalChunk = extractChunk(buffer.trim());
  if (finalChunk) {
    fullText += finalChunk;
    onChunk?.(fullText, finalChunk);
  }

  return fullText;
}

export async function streamWithFallback(streamUrl, fallbackRequest, { onChunk } = {}) {
  try {
    const streamed = await postEventStream(streamUrl, undefined, { onChunk });
    if (streamed) return streamed;
  } catch (error) {
    if (![404, 405, 501].includes(error.status)) throw error;
  }

  const result = await fallbackRequest();
  onChunk?.(result || '', result || '');
  return result;
}
