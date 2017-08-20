/**
 * Provide a database collection
 */

'use strict';

import assert from 'assert';
import stream from 'stream';

import Loki   from 'lokijs';

import logger from './log';

const db = new Loki();

export default class Collection extends stream.Duplex {
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
        const r = this._collection.find({'id':id});
        logger.trace('Finding with id ' + id + ': returning: ' + JSON.stringify(r));
        return r;
    }

    /**
     * Implements the mandatory Writable stream _write method
     */
    _write(chunk, encoding, callback) {
        logger.debug('Collection: Storing: ' + chunk.id);
        try {
            if (this._collection.insertOne(chunk)) {
                callback();
            } else {
                const error = new Error('Could not insert to db: ' + chunk);
                logger.error('Collection: error: ' + error);
                callback(error);
            }
        } catch (error) {
            logger.error('Collection: error: ' + error);
            callback(error);
        }
        logger.debug('Collection: Storing: ' + chunk.id + '. Done.');
    }

    /**
     * Implements the mandatory Readable stream _read method

    _read(size) {
        //      while (this.push(
    }
     */

    /**
     * Import transactions from an object stream.
     * @source  A stream of objects
     * @returns A Promise that completes when all data has been imported
     */
    from(source) {
        assert(source);
        assert(typeof source.reduce === 'function');
        return source.reduce(
            (coll, doc) => {
                coll._collection.insert(doc);
                return coll;
            }, this
        );
    }
}
