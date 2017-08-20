/**
 * Provide a db collection of invoices
 */

'use strict';

import Collection from './collection';

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
}
