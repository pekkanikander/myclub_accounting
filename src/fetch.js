/**
 * Fetch differents kind of data through the myclub.fi API,
 * returning scramjet streams of objects
 */

'use strict';

import        http  from 'https';
import       fetch  from 'node-fetch';

import      config  from 'config';

import {DataStream} from 'scramjet';

import logger       from './log';

const DefaultFetchHeaders = {
    'Content-Type': 'application/json',
};

const fetch_options = {
    headers : Object.assign({}, DefaultFetchHeaders, config.headers),
    agent   : new http.Agent({
        keepAlive: true,
        maxSockets: 2,
    })
};

/**
 * Returns the JSON from the specified URL as a DataStream
 */
function fetch_as_JSON_stream(url) {
    const ds = new DataStream();
    try {
        logger.debug('Fetch: ' + config.base_url + url);
        fetch(config.base_url + url, fetch_options)
            .then((res)  => res.json())
            .then((json) => {
                if (!(json instanceof Array)) {
                    const err = 'Non-array JSON received: ' + JSON.stringify(json);
                    throw new Error(err);
                }
                // See data-stream.js fromArray()
                const arr = json.slice(); // Shallow copy
                process.nextTick(() => {
                    arr.forEach((item) => ds.write(item));
                    ds.end();
                });
            })
        ;
    } catch (e) {
        logger.error('Fetch: ' + config.base_ur + url + ': failed:' + e);
        throw (e);
    }
    return ds;
}

/**
 * Returns the JSON from the specified URL as a DataStream of one item
 */
function fetch_as_JSON_singleton_stream(url) {
    const ds = new DataStream();
    try {
        logger.debug('Fetch: ' + config.base_url + url);
        fetch(config.base_url + url, fetch_options)
            .then((res)  => {
                return res.json();
            })
            .then((json) => ds.end(json))
        ;
    } catch (e) {
        logger.error('Fetch: ' + config.base_ur + url + ': failed:' + e);
        throw (e);
    }
    return ds;
}

/**
 * Returns all the groups in a myclub account
 * @return a Readable DataStream of group objects
 */
export function groups() {
    logger.info('Fetch: groups');
    return fetch_as_JSON_stream('groups');
}

/**
 * Returns all the bank account in a myclub account
 * @return a Readable DataStream of bank objects
 */
export function accounts() {
    logger.info('Fetch: accounts');
    return fetch_as_JSON_stream('bank_accounts');
}

/**
 * Returns the stream of myclub objects related to a stream of groups
 * @return a Readable DataStream of objects
 *
 * XXX: Refactor into more generic
 */
function combined_stream_from_groups(groups, URLfunc) {
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
    const out = new DataStream();
    groups.reduce(
        /* Reducer function, piping to output */
        function(out, group) {
            /*
             * Since all the substreams are piped to the output without
             * ending the output, we must still explicitly end it,
             * which we do once we encounter the sentinel.
             */
            last = fetch_as_JSON_stream(URLfunc(group));
            return last.pipe(out, {end: false});
        },
        /* Initial output, an empty DataStream. */
        out
    ).then(
        (out) => last.on('end', () => { out.end(); }) // XXX Simplify?
    );
    return out;
}

/**
 * Returns the stream of myclub events related to a stream of groups
 * @return a Readable DataStream of event objects
 */
export function events(groups) {
    logger.info('Fetch: events for several groups');
    return combined_stream_from_groups(
        groups,
        group => 'events/?group_id=' + group.group.id + '&start_date=2016-10-01'
    );
}

export function memberships(groups) {
    logger.info('Fetch: memberships several groups');
    return combined_stream_from_groups(
        groups,
        group => 'groups/' + group.group.id + '/memberships'
    );
}

export function member(id) {
    logger.info('Fetch: member ' + id);
    return fetch_as_JSON_singleton_stream('members/' + id);
}

function members_for_group(group) {
    logger.info('Fetch: members for group ' + group.group.id);
    return fetch_as_JSON_stream('groups/' + group.group.id + '/memberships')
        .map((membership) => {
            return member(membership.membership.member_id).reduce((res, member) => member);
        })
    ;
}

export function members(selector) {
    if (selector.group) {
        if (selector.group && selector.group.id) {
            return members_for_group(selector);
        }
        throw new Error('group.group or group.group.id undefined');
    }
    throw new Error('unknown selector type');
}

/**
 * Fetches a given invoice
 * @return A promise for the invoice
 */
export function invoice(id) {
    logger.info('Fetch: invoice ' + id);
    return fetch_as_JSON_singleton_stream('invoices/' + id).map(
        /* Convert payment dates to objects; we need them for comparisons */
        function (invoice) {
            // Add ID to the invoice
            invoice.invoice.id = id;
            // Convert invoice refences to integers
            invoice.invoice.reference = parseInt(invoice.invoice.reference);
            // Convert payment fields to saner ones
            invoice.invoice.payments.forEach(
                (payment) => {
                    payment.payment_date = new Date(payment.payment_date);
                    payment.reference    = parseInt(payment.reference);
                    payment.amount       = parseInt(payment.amount);
                }
            );
            return invoice;
        }
    );
}

/**
 * Handle options when used directly from command line
 */
if (typeof require !== 'undefined' && require.main === module) {

    process.on('unhandledRejection', function(reason, p) {
        logger.error('Fetch: Unhandled Rejection at:', p, 'reason:', reason);
        throw reason;
    });

    const argv = require('minimist')(process.argv.slice(2));
    argv._.forEach(function (keyword) {
        switch(keyword) {

        case 'members':
            members(config.group)
                .stringify((member) => (JSON.stringify(member, null, 2)))
                .pipe(process.stdout);
            break;

        case 'member':
            member(argv.i)
                .stringify((member) => (JSON.stringify(member, null, 2)))
                .pipe(process.stdout);
            break;

        case 'invoice':
            invoice(argv.i).each((invoice) => {
                logger.info('Invoice: ' + JSON.stringify(invoice));
            });
            break;
        }
    });
}

