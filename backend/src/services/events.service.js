/**
 * Shared in-memory event store for SSE streaming.
 * Used by both the HTTP route (registers SSE clients) and the BullMQ worker (emits events).
 * Since worker and server run in the same process, a simple Map is sufficient.
 */

// jobId -> { events, clients, done, status, createdAt, queuePos }
const jobs = new Map();

/**
 * Create a new job entry (call before enqueuing to BullMQ).
 */
export function initJob(jobId) {
  jobs.set(jobId, {
    events: [],
    clients: [],
    done: false,
    status: 'queued',
    createdAt: Date.now(),
  });
}

/**
 * Emit an event to all connected SSE clients and buffer it for late joiners.
 */
export function emitEvent(jobId, event) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.events.push(event);
  for (const client of job.clients) {
    try {
      client.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // client disconnected — will be cleaned up on 'close'
    }
  }
}

/**
 * Mark job as done, close all SSE connections, schedule cleanup.
 */
export function closeJob(jobId, status = 'completed') {
  const job = jobs.get(jobId);
  if (!job) return;
  job.done = true;
  job.status = status;
  for (const client of job.clients) {
    try { client.end(); } catch { /* ignore */ }
  }
  job.clients = [];
  // Keep in memory for 10 minutes so late-connecting clients can replay events
  setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000);
}

export function getJob(jobId) {
  return jobs.get(jobId) ?? null;
}

export function setJobStatus(jobId, status) {
  const job = jobs.get(jobId);
  if (job) job.status = status;
}

export function addClient(jobId, res) {
  const job = jobs.get(jobId);
  if (!job) return false;
  job.clients.push(res);
  return true;
}

export function removeClient(jobId, res) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.clients = job.clients.filter((c) => c !== res);
}
