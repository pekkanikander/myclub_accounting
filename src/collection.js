/**
 * Provide a database collection
 */

import assert from 'assert';

import Loki   from 'lokijs';

const db = new Loki();

export default class Collection {
    constructor(name) {
	this._collection = db.addCollection(name);
    }

    /**
     * Import transactions from an object stream.
     * @source  A stream of objects
     * @returns A Promise that completes when all data has been imported
     */
    async from(source) {
	assert(typeof source.reduce === 'function');
	return source.reduce(
	    (coll, doc) => (coll._collection.insert(doc), coll), this
	);
    }
}
