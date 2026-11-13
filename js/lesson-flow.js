// New exports live in a new module so a cached v4 model cannot break named imports.
import { isV4 } from './lesson-v4-model.js';
import { isV5 } from './lesson-v5-model.js';

export const hasGuidedStages = lesson => isV4(lesson) || isV5(lesson);
