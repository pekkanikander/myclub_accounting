/**
 * Provide a database collection
 */

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

    end(chunk, encoding, cb) {
	logger.debug("Collection: Ignoring stream end");
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
