import { single, multi } from './choice.js';
import fill from './fill.js';
import swipe from './swipe.js';
import order from './order.js';
import match from './match.js';
import categorize from './categorize.js';
import hotspot from './hotspot.js';
import promptBuilder from './prompt-builder.js';
import dilemma from './dilemma.js';
import text from './text.js';
import terminal from './terminal.js';
import python from './python.js';
import numeric from './numeric.js';
import file from './file.js';

export const TASK_TYPES = { single, multi, fill, swipe, order, match, categorize, hotspot, 'prompt-builder': promptBuilder, dilemma, text, terminal, python, numeric, file };
