'use strict';

import config  from 'config';
import log4js  from 'log4js';

const logger = log4js.getLogger();

logger.level = config.logger.level;

export default logger;
