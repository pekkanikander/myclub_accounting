/**
 * Provide a Scramjet stream of banking transactions 
 */

import {DataStream, StringStream} from 'scramjet';
import  Loki                      from 'lokijs';

import     fs from 'fs';
import config from 'config';

const db = new Loki();

/**
 * Converts a CVS file into a Stream of objects
 *
 * @param filename  Name of the CVS file to read
 * @param columnMap An object used to convert column names to keys
 */
function cvsFileToStream(filename, columnMap) {
    var columns;
    columnMap = columnMap || {};
    return fs.createReadStream(filename, { encoding: 'latin1' } )
	.pipe(new StringStream())
	.split('\n')                               // Split to lines
        .map(   (line) => line.replace(/;$/, ''))  // Remove trailing semicolons
        .filter((line) => line !== '')             // Remove empty lines
	.parse( (line) => line.split(';'))         // Split to fields
	.pop(1, (data) => columns = data[0])       // Take column names
	.map(   (data) => columns.reduce(          // Convert lines to objects
	    (obj, field, index) => {
		field = columnMap[field] || field; // Map field names
		obj[field] = data[index];
		return obj;
	    },
	    {}
	))
	.each((obj) => {                            // Sanitise object fields

	    // Date
	    const [all, day, month, year] = obj.date
		    .match(/([0-9]+)\.([0-9]+).([0-9]+)/);
	    obj.date = new Date(Date.UTC(year, month-1, day, 0, 0, 0));

	    // Convert reference to numerical or convert to explanation
	    const reference = parseInt(obj.reference);
	    if (String(reference) === obj.reference) {
		obj.reference   = reference;
	    } else {
		obj.explanation = obj.reference;
		obj.reference   = undefined;
	    }
	    // Amount
	    obj.amount = parseInt(obj.amount);
	})
    ;
}


/**
 * A Transactions database
 */
export default class Transactions {
    constructor(source) {
	this._collection = db.addCollection('transactions');
	if (source) {
	    this.from(source);
	}
    }

    /**
     * Import transactions from an object stream.
     * @source  A stream of objects
     * @returns A Promise that completes when all data has been imported
     */
    async from(source) {
	if (typeof source === 'string') {
	    source = cvsFileToStream(source, config.field_conversion);
	}

	return source.reduce(
		(coll, doc) => {
		    coll._collection.insert(doc)
		    return coll;
		}, this
	);
    }

    /**
     * Find transactions by the reference
     * @returns An array of transaction objects
     */
    findByReference(reference) {
	const r = this._collection.find({'reference':reference});
	return r;
    }

    /**
     * Pipe transactions data to an object stream
     */
    pipe(sink, transformations) {
	this._collection.chain(transformations).where(
	    (doc) => ( sink.write(doc), false )
	);
	return sink;
    }
}

/**
 * Handle options when used directly from command line
 */
if (typeof require !== 'undefined' && require.main === module) {

    process.on('unhandledRejection', function(reason, p) {
	console.log('Unhandled Rejection at:', p, 'reason:', reason);
	throw reason;
    });

    const argv = require('minimist')(process.argv.slice(2));
    argv._.forEach(async function (keyword) {
	const stream = await cvsFileToStream(argv.f, config.field_conversion);

	switch(keyword) {

	case 'import': {
	    const T = new Transactions();
	    T.from(stream).then(() => {
		T.pipe(new DataStream())
		    .stringify(obj => JSON.stringify(obj, null, 2))
		    .pipe(process.stdout);
	    });
	    break;
	}
	case 'find': {
	    const T = new Transactions();
	    T.from(stream).then(() => {
		const r = T.findByReference(parseInt(argv.r));
		console.log(r);
	    });
	    break;
	}
	}
    });
}

    
