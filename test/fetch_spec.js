import   {assert,expect} from 'chai';
import {deepStrictEqual} from 'assert';
import      {DataStream} from 'scramjet';
import     streamCompare from 'stream-compare';

import    chaiAsPromised from 'chai-as-promised';

import * as fetch from '../src/fetch';

import test_groups       from './private/test_groups.json';
import test_accounts     from './private/test_accounts.json';
import test_events       from './private/test_events.json';
import test_memberships  from './private/test_memberships.json';
import test_members      from './private/test_members.json';
import requester_id      from './private/test_requester_id.json';

import  stringify from 'csv-stringify';


function streamify(array) {
    return DataStream.fromArray(array);
}

/**
 * Returns a promise
 */
function streamEqual(s1, s2) {
    const options = {
	abortOnerror: true,
	incremental: streamCompare.makeIncremental(deepStrictEqual),
	objectMode: true,
//	readPolicy: 'flowing'
    };
    return streamCompare(s1, s2, options);
}

describe('asynchronous fetching', () => {
    describe('function groups', () => {
        it('returns the right groups as a stream', async function () {
	    this.timeout(5000);
            const groups = await fetch.groups();
            expect(groups).be.a.ReadableStream;
	    return streamEqual(groups, streamify(test_groups));
	});
    });

    describe('function accounts', () => {
        it('returns the right accounts', async function () {
	    this.timeout(5000);
            const accounts = await fetch.accounts();
            expect(accounts).be.a.ReadableStream;
	    return streamEqual(accounts, streamify(test_accounts));
        });
    });

    describe('function events', () => {
        it('returns the right events for all groups', async function () {
	    this.timeout(5000);
            const events = await fetch.events(streamify(test_groups));
            expect(events).be.a.ReadableStream;
	    events.end();
	    return streamEqual(events, streamify(test_events));
        });
    });

    describe('function memberships', () => {
        it('returns the right members', async function () {
	    this.timeout(5000);
            const memberships = await fetch.memberships(streamify(test_groups));
	    expect(memberships).be.a.ReadableStream;

	    // the following does not work due to async ordering
	    // return streamEqual(memberships, streamify(test_memberships));

	    function c(a, b) {
		if (a.membership.member_id == b.membership.member_id)
		    return (a.membership.group_id - b.membership.group_id);
		return (a.membership.member_id - b.membership.member_id);
	    }
	    const fetched_memberships = (await memberships.toArray()).sort(c);
	    const expected_memberships = test_memberships.sort(c);

	    return expect(fetched_memberships).be.eql(expected_memberships);
        });
    });

    describe('function members', () => {
        it('returns the right members for a single group', async function () {
	    this.timeout(60000);
            const members = await fetch.members(test_groups[0]);
	    expect(members).be.a.ReadableStream;
	    members.end();
	    const members_without_requester = members.filter(
		member => member.member.id !== requester_id
	    );
	    return streamEqual(members_without_requester, streamify(test_members));
	});
    });
});
