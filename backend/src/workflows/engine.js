/**
 * Workflow Engine
 *
 * Executes a workflow step by step, threading a shared context object
 * through each module. Each module reads from and writes to ctx.
 *
 * Usage:
 *   const engine = new WorkflowEngine({ emitEvent, jobId, workflowRunId, saveStep });
 *   const result = await engine.run(template, initialInput);
 */

export class WorkflowEngine {
  /**
   * @param {{ emitEvent: Function, jobId: string, workflowRunId?: string, saveStep?: Function }} opts
   */
  constructor({ emitEvent, jobId, workflowRunId = null, saveStep = null }) {
    this.emitEvent      = emitEvent;
    this.jobId          = jobId;
    this.workflowRunId  = workflowRunId;
    // saveStep(workflowRunId, moduleType, stepIndex, status, resultJson, errorMessage)
    this.saveStep       = saveStep;
  }

  /**
   * Run a workflow template with an initial input context.
   *
   * @param {{ id: string, name: string, steps: StepDefinition[] }} template
   * @param {Record<string, unknown>} initialInput  - seed values (keyword, theme, siteId…)
   * @returns {Promise<WorkflowContext>}
   */
  async run(template, initialInput = {}) {
    const ctx = this._buildContext(initialInput);

    this.emitEvent(this.jobId, {
      type: 'step',
      message: `▶ Démarrage workflow "${template.name}" (${template.steps.length} étapes)`,
    });

    for (let i = 0; i < template.steps.length; i++) {
      const stepDef = template.steps[i];

      // Skip disabled steps
      if (stepDef.enabled === false) {
        this.emitEvent(this.jobId, {
          type: 'step',
          message: `⏭ Étape ignorée : ${stepDef.label ?? stepDef.type}`,
        });
        continue;
      }

      this.emitEvent(this.jobId, {
        type: 'step',
        message: `[${i + 1}/${template.steps.length}] ${stepDef.label ?? stepDef.type}`,
      });

      // Resolve module implementation
      const module = stepDef.module;
      if (!module || typeof module.execute !== 'function') {
        throw new Error(`[WorkflowEngine] Module introuvable ou invalide pour le step "${stepDef.type}"`);
      }

      try {
        // Validate required input ports before running
        this._validateInputs(stepDef, ctx);

        // Execute module — it mutates ctx in place and may return partial data
        const output = await module.execute(ctx, stepDef.config ?? {}, {
          emitEvent: this.emitEvent,
          jobId:     this.jobId,
          stepIndex: i,
          stepDef,
        });

        // Merge output back into ctx (never replace — only enrich)
        if (output && typeof output === 'object') {
          Object.assign(ctx, output);
        }

        ctx._steps.push({
          type:    stepDef.type,
          label:   stepDef.label ?? stepDef.type,
          status:  'done',
          output,
        });

        // Persist step result to DB (non-blocking)
        if (this.saveStep && this.workflowRunId) {
          this.saveStep(this.workflowRunId, stepDef.type, i, 'done', output, null).catch(() => {});
        }
      } catch (err) {
        const isOptional = stepDef.optional === true;

        ctx._steps.push({
          type:   stepDef.type,
          label:  stepDef.label ?? stepDef.type,
          status: 'error',
          error:  err.message,
        });

        this.emitEvent(this.jobId, {
          type:    'step',
          message: `${isOptional ? '⚠️' : '❌'} Erreur step "${stepDef.type}": ${err.message}`,
        });

        // Persist error to DB (non-blocking)
        if (this.saveStep && this.workflowRunId) {
          this.saveStep(this.workflowRunId, stepDef.type, i, 'error', null, err.message).catch(() => {});
        }

        if (!isOptional) throw err;
      }
    }

    this.emitEvent(this.jobId, {
      type: 'step',
      message: `✅ Workflow "${template.name}" terminé`,
    });

    return ctx;
  }

  /**
   * Build the mutable context object that flows through every module.
   * @private
   */
  _buildContext(initialInput) {
    return {
      // User-provided inputs
      ...initialInput,

      // Populated by modules as they run
      siteProfile:       null,
      sitemapUrls:       [],
      mainKeyword:       null,
      kd:                null,
      kwSearchVolume:    null,
      serpResults:       [],
      serpModel:         null,
      semanticAnalysis:  null,
      outline:           null,
      blogContent:       null,
      htmlBody:          null,
      fieldData:         null,
      images:            null,
      faqQuestions:      [],
      internalLinks:     [],

      // Internal audit trail
      _steps: [],
    };
  }

  /**
   * Validate that all required input ports for a step are present in ctx.
   * Throws with a clear message listing the missing keys.
   * @private
   */
  _validateInputs(stepDef, ctx) {
    const requiredPorts = (stepDef.ports?.in ?? []).filter(p => p.required);
    const missing = requiredPorts
      .filter(p => ctx[p.key] == null || ctx[p.key] === '')
      .map(p => `"${p.key}" (${p.label})`);

    if (missing.length > 0) {
      throw new Error(
        `[${stepDef.type}] Entrée(s) manquante(s) : ${missing.join(', ')}. ` +
        'Ajoutez un module qui produit ces valeurs avant celui-ci dans le workflow.'
      );
    }
  }
}
