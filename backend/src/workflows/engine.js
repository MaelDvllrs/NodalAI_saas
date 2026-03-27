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
   * @param {Array<{source: string, target: string}>} edges  - canvas connexions for dependency checks
   * @returns {Promise<WorkflowContext>}
   */
  // Module types that are "input sources": they inject static values into ctx
  // immediately and are never treated as blocking dependencies.
  static INPUT_TYPES = new Set(['text-input', 'prompt-input']);

  async run(template, initialInput = {}, edges = []) {
    const ctx = this._buildContext(initialInput);

    // ── Pre-execute all input-source steps (text-input etc.) ──────────────────
    // Their values are injected into ctx before the main loop so downstream
    // modules never get blocked waiting for them.
    const doneIds = new Set();
    for (const stepDef of template.steps) {
      if (!WorkflowEngine.INPUT_TYPES.has(stepDef.type)) continue;
      
      // Emit start event for frontend tracking
      this.emitEvent(this.jobId, {
        type: 'module-start',
        moduleType: stepDef.type,
        instanceId: stepDef.instanceId,
        label: stepDef.label ?? stepDef.type,
      });
      
      const mod = stepDef.module;
      if (mod && typeof mod.execute === 'function') {
        try {
          const output = await mod.execute(ctx, stepDef.config ?? {}, {
            emitEvent: this.emitEvent,
            jobId:     this.jobId,
            stepIndex: -1,
            stepDef,
          });
          if (output && typeof output === 'object') Object.assign(ctx, output);
          
          // Emit done event for frontend tracking
          this.emitEvent(this.jobId, {
            type: 'module-done',
            moduleType: stepDef.type,
            instanceId: stepDef.instanceId,
            label: stepDef.label ?? stepDef.type,
          });
        } catch (e) {
          this.emitEvent(this.jobId, { type: 'step', message: `⚠️ Entrée texte ignorée (${stepDef.type}): ${e.message}` });
          // Emit error event for frontend tracking
          this.emitEvent(this.jobId, {
            type: 'module-error',
            moduleType: stepDef.type,
            instanceId: stepDef.instanceId,
            label: stepDef.label ?? stepDef.type,
            error: e.message,
          });
        }
      }
      // Mark as done so it never blocks downstream modules
      if (stepDef.instanceId) doneIds.add(stepDef.instanceId);
    }
    // ──────────────────────────────────────────────────────────────────────────

    // Build predecessors map: instanceId → [instanceId…] of required upstream steps
    // Input-source predecessors are excluded from blocking checks (already done above).
    const predecessors = new Map(template.steps.map(s => [s.instanceId, []]));
    for (const { source, target } of edges) {
      if (predecessors.has(target)) {
        const srcStep = template.steps.find(s => s.instanceId === source);
        // Only non-input predecessors are blocking
        if (!srcStep || !WorkflowEngine.INPUT_TYPES.has(srcStep.type)) {
          predecessors.get(target).push(source);
        }
      }
    }
    // Map instanceId → label for readable log messages
    const idToLabel = new Map(template.steps.map(s => [s.instanceId, s.label ?? s.type]));

    // Emit the full module list upfront so the frontend can compute weighted progress
    // from the very first event (total weight is known before any module runs).
    const executableModules = template.steps
      .filter(s => !WorkflowEngine.INPUT_TYPES.has(s.type) && s.enabled !== false)
      .map(s => ({ type: s.type, instanceId: s.instanceId, label: s.label ?? s.type }));

    this.emitEvent(this.jobId, {
      type: 'workflow-start',
      modules: executableModules,
    });

    this.emitEvent(this.jobId, {
      type: 'step',
      message: `▶ Démarrage workflow "${template.name}" (${template.steps.length} étapes)`,
    });

    for (let i = 0; i < template.steps.length; i++) {
      const stepDef = template.steps[i];

      // Input-source steps were pre-executed above — skip them in the main loop
      if (WorkflowEngine.INPUT_TYPES.has(stepDef.type)) continue;

      // Skip disabled steps
      if (stepDef.enabled === false) {
        this.emitEvent(this.jobId, {
          type: 'step',
          message: `⏭ Étape ignorée : ${stepDef.label ?? stepDef.type}`,
        });
        continue;
      }

      // ── Dependency gate ────────────────────────────────────────────────────
      const requiredPreds = (predecessors.get(stepDef.instanceId) ?? []);
      if (requiredPreds.length > 0) {
        const pendingLabels = requiredPreds
          .filter(id => !doneIds.has(id))
          .map(id => idToLabel.get(id) ?? id);

        if (pendingLabels.length > 0) {
          const msg = `⛔ Module "${stepDef.label ?? stepDef.type}" bloqué — modules précédents non terminés : ${pendingLabels.join(', ')}`;
          this.emitEvent(this.jobId, { type: 'error', message: msg });
          throw new Error(msg);
        }

        const doneLabels = requiredPreds.map(id => idToLabel.get(id) ?? id);
        this.emitEvent(this.jobId, {
          type: 'step',
          message: `✔ Dépendances OK (${doneLabels.join(', ')}) → lancement de "${stepDef.label ?? stepDef.type}"`,
        });
      }
      // ───────────────────────────────────────────────────────────────────────

      this.emitEvent(this.jobId, {
        type: 'step',
        message: `[${i + 1}/${template.steps.length}] ${stepDef.label ?? stepDef.type}`,
      });

      // Emit module start event for precise frontend tracking
      this.emitEvent(this.jobId, {
        type: 'module-start',
        moduleType: stepDef.type,
        instanceId: stepDef.instanceId,
        label: stepDef.label ?? stepDef.type,
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

        // Mark this step as done for downstream dependency checks
        if (stepDef.instanceId) doneIds.add(stepDef.instanceId);

        // Emit module done event for precise frontend tracking
        this.emitEvent(this.jobId, {
          type: 'module-done',
          moduleType: stepDef.type,
          instanceId: stepDef.instanceId,
          label: stepDef.label ?? stepDef.type,
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

        // Emit module error event for precise frontend tracking
        this.emitEvent(this.jobId, {
          type: 'module-error',
          moduleType: stepDef.type,
          instanceId: stepDef.instanceId,
          label: stepDef.label ?? stepDef.type,
          error: err.message,
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

      // Prompt snippets contributed by upstream modules (consumed by blog-generation)
      promptSnippets:    [],

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

      // Accumulated translations (one entry per blog-translation step)
      translations: [],

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
