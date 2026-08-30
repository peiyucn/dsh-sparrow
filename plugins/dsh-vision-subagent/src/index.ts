/** dsh-vision-subagent 入口：host half 契约。 */
export { apply, inject, name } from './host.js'
export type { VisionConfig, VisionReport } from './vision.js'
export {
  extractJsonObject, findImageReference, normalizeVisionConfig, parseVisionReport,
  renderVisionReport, shouldClearInputModalities, VisionCache,
} from './vision.js'
