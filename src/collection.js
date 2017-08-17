/**
 * Provide a database collection
 */

'use strict';

import assert from 'assert';
import stream from 'stream';

import Loki   from 'lokijs';

import logger from './log';

const db = new Loki();

export default class Collection extends stream.Writable {
    constructor(name, options) {
	options = options || {};
	options.objectMode = true;
	super(options);
	this._collection = db.addCollection(name);
    }

    /**
     * Find elements by the reference
     * @returns An array of transaction objects
     */
    findByReference(reference) {
	const r = this._collection.find({'reference':reference});
	return r;
    }

    /**
     * Find elements by their ID
     * @returns An array of transaction objects
     */
    findById(id) {
	logger.info('Finding with id ' + id);
	const r = this._collection.find({'id':id});
	return r;
    }

    /**
     * Allow XXX
     */
    end(chunk, encoding, cb) {
	logger.debug("Collection: Ignoring stream end");
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

    /**
     * Implements the mandatory Writable stream _write method
     */
    _write(chunk, encoding, callback) {
	logger.debug("Collection: Inserting " + chunk);
	if (this._collection.insertOne(chunk)) {
	    callback();
	} else {
	    callback(new Error('Could not insert to db: ' + chunk));
	}
    }

    /**
     * Import transactions from an object stream.
     * @source  A stream of objects
     * @returns A Promise that completes when all data has been imported
     */
    async from(source) {
	assert(typeof source.reduce === 'function');
	return source.reduce(
	    (coll, doc) => {
		coll._collection.insert(doc);
		return coll;
	    }, this
	);
    }
}
