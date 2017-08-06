
import       fetch  from 'node-fetch';
import  JSONStream  from 'JSONStream';

import      config  from 'config';

import {DataStream} from 'scramjet';

const DefaultFetchHeaders = {
    'User-Agent': 'fetch',
    'Content-Type': 'application/json',
};

/**
 * Returns the JSON from the specified URL as a DataStream
 *
 * XXX Refactor to be really asynchronous.
 */
async function fetch_as_JSON_stream(url) {
    const fetch_options = {
        'headers' : Object.assign({}, DefaultFetchHeaders, config.headers)
    };

    try {
        const res  = await fetch(config.base_url + url, fetch_options);
	const json = await res.json();
	if (!(json instanceof Array)) {
	    const err = "Non-array JSON received: " + JSON.stringify(json);
	    throw new Error(err);
	}
        return DataStream.fromArray(json);
    } catch (e) {
        console.log("Fetching failed for " + url + ":" + e);
        throw (e);
    }
}

/**
 * Returns the JSON from the specified URL as an object
 */
async function fetch_as_JSON_object(url) {
    const fetch_options = {
        'headers' : Object.assign({}, DefaultFetchHeaders, config.headers)
    };

    try {
        const res = await fetch(config.base_url + url, fetch_options);
        return await res.json();
    } catch (e) {
        console.log("Fetching failed for " + url + ":" + e);
        throw (e);
    }
}

/**
 * Returns all the groups in a myclub account
 * @return a Readable DataStream of group objects
 */
export function groups() {
    return fetch_as_JSON_stream('groups');
}

/**
 * Returns all the bank account in a myclub account
 * @return a Readable DataStream of bank objects
 */
export function accounts() {
    return fetch_as_JSON_stream('bank_accounts');
}

/**
 * Returns the stream of myclub objects related to a stream of groups
 * @return a Readable DataStream of objects
 *
 * XXX: Refactor into more generic
 */
async function combined_stream_from_groups(groups, URLfunc) {
    /*
     * Record the stream created for the last group.
     * This will be drained last, and when ended, we must
     * also end the output.
     */
    var last = null;

    /*
     * Reduce the stream of groups into a single stream that receives
     * all events from all of the group-specific streams.
     */
    const out = await groups.reduce(
        /* Reducer function, piping to output */
        async function(out, group) {
            /*
             * Since all the substreams are piped to the output without
             * ending the output, we must still explicitly end it,
             * which we do once we encounter the sentinel.
             */
            last = await fetch_as_JSON_stream(URLfunc(group));
            return last.pipe(out, {end: false});
        },
        /* Initial output, an empty DataStream. */
        new DataStream()
    );
    last.on('end', () => { out.end() });
    return out;
}

/**
 * Returns the stream of myclub events related to a stream of groups
 * @return a Readable DataStream of event objects
 */
export function events(groups) {
    return combined_stream_from_groups(
        groups,
        group => 'events/?group_id=' + group.group.id + '&start_date=2016-10-01'
    );
}

export function memberships(groups) {
    return combined_stream_from_groups(
        groups,
        group => 'groups/' + group.group.id + '/memberships'
    );
}

async function members_for_group(group) {
    const memberships
          = await fetch_as_JSON_stream("/groups/" + group.group.id + "/memberships");
    // Use reduce instead of map in order to serialise the RESTful fetches
    const out = await memberships.reduce(
        async function (out, membership) {
            console.log("Fetching member " + membership.membership.member_id);
            const member = await fetch_as_JSON_object(
		"/members/" + membership.membership.member_id);
            out.write(member);
            return out;
        },
        new DataStream()
    );
    out.end();
    return out;
}

export function members(selector) {
    if (selector.group) {
	if (selector.group && selector.group.id) {
	    return members_for_group(selector);
	}
	throw new Error("group.group or group.group.id undefined");
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
	switch(keyword) {

	case 'members':
	    const stream = await members({group:{id:1305}} /*XXX*/);
	    const array  = await stream.toArray();
	    console.log(JSON.stringify(array, null, 2));
	    break;
	}
    });
}

