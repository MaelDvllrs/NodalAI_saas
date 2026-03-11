import { Worker } from 'bullmq';
import { connection } from '../config/redis.js';
import { runSeoPreview } from '../services/pipeline.service.js';
import { runCustomWorkflow } from '../workflows/index.js';
import { emitEvent, closeJob } from '../services/events.service.js';
import {
  updateWorkflowRun,
  saveWorkflowRunStep,
} from '../services/workflow.service.js';

export function startGenerationWorker() {
  const worker = new Worker(
    'blog-generation',
    async (job) => {
      const { type, jobId } = job.data;

      if (type === 'workflow') {
        const { steps, input, userId, workflowRunId } = job.data;

        // workflowRunId === jobId when the user is authenticated (created in the route)
        const saveStepFn = workflowRunId
          ? (runId, type, idx, status, result, err) =>
              saveWorkflowRunStep({ workflowRunId: runId, moduleType: type, stepIndex: idx, status, resultJson: result, errorMessage: err })
          : null;

        try {
          await runCustomWorkflow(steps, { ...input, userId }, {
            jobId,
            emitEvent,
            workflowRunId: workflowRunId ?? null,
            saveStep:      saveStepFn,
          });

          if (workflowRunId) {
            await updateWorkflowRun(workflowRunId, 'done').catch(() => {});
          }

          emitEvent(jobId, { type: 'done', message: 'Workflow terminé avec succès.' });
          closeJob(jobId, 'completed');
        } catch (err) {
          if (workflowRunId) {
            await updateWorkflowRun(workflowRunId, 'error').catch(() => {});
          }
          emitEvent(jobId, { type: 'error', message: err.message });
          closeJob(jobId, 'failed');
          throw err;
        }

      } else if (type === 'seo-preview') {
        await runSeoPreview(jobId, job.data.params);

      } else {
        throw new Error(`Unknown job type: ${type}`);
      }
    },
    { connection, concurrency: 2 }
  );

  worker.on('failed', (job, err) => {
    // For workflow jobs, error + closeJob are already handled inside the try/catch above.
    // This handler catches unexpected throws for other job types (e.g. seo-preview).
    if (job?.data?.jobId && job?.data?.type !== 'workflow') {
      emitEvent(job.data.jobId, { type: 'error', message: err.message });
      closeJob(job.data.jobId, 'failed');
    }
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} (${job.data?.type}) completed`);
  });

  console.log('[Worker] Generation worker started (concurrency: 2)');
  return worker;
}
