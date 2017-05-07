import {expect,assert} from 'chai';
import       streamify from 'stream-array';
import     streamEqual from 'stream-equal';
import               _ from 'highland';

import * as fetch from '../src/fetch';

import settings      from "./private/test_settings.json";

import test_groups   from './private/test_groups';
import test_accounts from './private/test_accounts';
import test_events   from './private/test_events';

describe('asynchronous fetching', () => {
    describe('function groups', () => {
        it('return the right groups as a stream', async () => {
            const groups = await fetch.groups(settings);
	    // console.log(groups);
            expect(groups).be.a.ReadableStream;
	    assert(streamEqual(groups, _(streamify(test_groups))));
        });
    });

    describe('return the right accounts as a stream', () => {
        it('return the right accounts', async () => {
            const accounts = await fetch.accounts(settings);
            expect(accounts).be.a.ReadableStream;
	    assert(streamEqual(accounts, _(streamify(test_accounts))));
        });
    });

    describe('return the right events as a stream', () => {
        it('return the right events', async () => {
            const events = await fetch.events(settings, _(streamify(test_groups)));
            expect(events).be.a.ReadableStream;
	    assert(streamEqual(events, _(streamify(test_events))));
        });
    });
});
