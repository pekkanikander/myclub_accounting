/**
 * Provide a Scramjet stream of banking transactions 
 */

import {DataStream, StringStream} from 'scramjet';

import     fs from 'fs';
import config from 'config';

/**
 * Converts a CVS file into a Stream of transaction objects
 *
 * @param filename  Name of the CVS file to read
 * @param columnMap An object used to convert column names to keys
 */

export function from(filename, columnMap) {
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
	));
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
	switch(keyword) {

	case 'from':
	    const stream = await from(argv.f, config.field_conversion);
	    const array  = await stream.toArray();
	    console.log(JSON.stringify(array, null, 2));
	    break;
	}
    });
}

    
