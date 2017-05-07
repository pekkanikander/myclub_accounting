
import       fetch from 'node-fetch';
import  JSONStream from 'JSONStream';
import           _ from 'highland';

const DefaultFetchHeaders = {
    'User-Agent': 'fetch',
    'Content-Type': 'application/json',
};

/**
 * Returns the JSON from the specified URL as a Highland JSON stream
 */
async function fetch_as_JSON_stream(settings, url) {
    const fetch_options =
          {
              'headers' : Object.assign({}, DefaultFetchHeaders, settings.headers)
          };

    const res = await fetch(settings.base_url + url, fetch_options);
    return _(res.body).pipe(JSONStream.parse());
}

/**
 * Returns all the groups in a myclub account
 * @return a Readable Highland stream of group objects
 */
export function groups(settings) {
    return fetch_as_JSON_stream(settings, 'groups');
}

/**
 * Returns all the bank account in a myclub account
 * @return a Readable Highland stream of bank objects
 */
export function accounts(settings) {
    return fetch_as_JSON_stream(settings, 'bank_accounts');
}

/**
 * Returns the stream of myclub events related to a stream of groups
 * @return a Readable Highland stream of event objects
 */
export function events(settings, groups) {
    return groups.map(
	group => fetch_as_JSON_stream(settings, 'events/?group_id=' + group.group.id)
    ).merge();
}

export async function members(settings, groups) {
    // XXX CONTINUE HERE; THIS IS NOT CORRECT
    const member_ids
          = groups.reduce(
              (arr, group) => {
                  return fetch_json(settings, 'groups/' + group.group.id + '/memberships').
                      then(arr.concat(ids));
              } , [] );
    // return await* member_ids.map(
}
