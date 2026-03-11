/**
 * Text Input Module
 *
 * Injects a static text value into the pipeline context under a configurable key.
 * Useful as a source node: e.g. set theme → keyword-research, or mainKeyword → serp-analysis.
 */

export const TextInputModule = {
  async execute(ctx, config, { emitEvent, jobId }) {
    const key   = config.outputKey || 'theme';
    const value = config.value     || '';

    emitEvent(jobId, {
      type: 'step',
      message: `📝 Entrée texte : ${key} = "${value}"`,
    });

    emitEvent(jobId, { type: 'data', key, value });

    return { [key]: value };
  },
};
