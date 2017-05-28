
import       fetch  from 'node-fetch';
import  JSONStream  from 'JSONStream';

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
async function fetch_as_JSON_stream(settings, url) {
    const fetch_options = {
        'headers' : Object.assign({}, DefaultFetchHeaders, settings.headers)
    };

    try {
	const res = await fetch(settings.base_url + url, fetch_options);
	return DataStream.fromArray(await res.json());
    } catch (e) {
	console.log("Fetching failed for " + url + ":" + e);
	throw (e);
    }
}

/**
 * Returns the JSON from the specified URL as an object
 */
async function fetch_as_JSON_object(settings, url) {
    const fetch_options = {
        'headers' : Object.assign({}, DefaultFetchHeaders, settings.headers)
    };

    try {
	const res = await fetch(settings.base_url + url, fetch_options);
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
export function groups(settings) {
    return fetch_as_JSON_stream(settings, 'groups');
}

/**
 * Returns all the bank account in a myclub account
 * @return a Readable DataStream of bank objects
 */
export function accounts(settings) {
    return fetch_as_JSON_stream(settings, 'bank_accounts');
}

/**
 * Returns the stream of myclub objects related to a stream of groups
 * @return a Readable DataStream of objects
 *
 * XXX: Refactor into more generic
 */
async function combined_stream_from_groups(settings, groups, URLfunc) {
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
	    console.log("Fetching for group " + group.group.id);
	    last = await fetch_as_JSON_stream(settings, URLfunc(group));
	    return last.pipe(out, {end: false});
	},
	/* Initial output, an empty DataStream. */
	new DataStream()
    );
    console.log("Fetched all");
    last.on('end', () => { console.log("End called"); out.end() });
    return out;
}

/**
 * Returns the stream of myclub events related to a stream of groups
 * @return a Readable DataStream of event objects
 */
export function events(settings, groups) {
    return combined_stream_from_groups(
	settings, groups,
	group => 'events/?group_id=' + group.group.id + '&start_date=2016-10-01'
    );
}

export function memberships(settings, groups) {
    return combined_stream_from_groups(
	settings, groups,
	group => 'groups/' + group.group.id + '/memberships'
    );
}

export async function members(settings, group) {
    const memberships
	  = await fetch_as_JSON_stream(settings, "/groups/" + group.group.id + "/memberships");
    return memberships.map(member => {
	return fetch_as_JSON_object(settings, "/members/" + member.member.id)
    });
}
