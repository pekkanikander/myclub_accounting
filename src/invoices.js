/**
 * Provide a db collection of invoices
 */

'use strict';

import Collection from './collection';
import logger     from './log';

/**
 * An Invoices database
 */
export default class Invoices extends Collection {
    /**
     * Creates a new empty Invoices db collection
     *
     * Note that it is not a good idea to fill the db here,
     * as filling the db is an async operatoin and the
     * constructor should not (cannot?) return a Promise.
     */
    constructor(options) {
        super('invoices', options);
    }

    /**
     * Allow XXX
     */
    end(chunk, encoding, cb) {
        logger.debug('Collection: Ignoring stream end');
        super.end(chunk, encoding, () => {
            // Unend after the callback has been called.
            if (cb) {
                cb();
            }
            const state = this._writableState;
            state.ending = false;
            state.finished = false;
            state.ended = false;
            state.writable = true;
        });
    }

    _write(chunk, encoding, callback) {
        logger.info('Storing invoice: ' + JSON.stringify(chunk));
        super._write(chunk, encoding, callback);
    }    
}
