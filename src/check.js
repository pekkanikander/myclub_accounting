/**
 * Performs various kinds of crosschecks on myclub.fi and bank transactions data
 */

import assert       from 'assert';
import config       from 'config';
import * as fetch   from './fetch.js';
import Transactions from './transactions.js';
import {DataStream} from 'scramjet';

/**
 * Checks the total balance of a given member's invoces
 * @param member       A member object
 * @param transactions A Scramjet Stream of bank transactions
 * @returns 
 */
async function check_member_payments(member, transactions) {
    // Max four days of difference
    const DATE_EPSILON = Math.abs(new Date(1970, 0, 5, 0).valueOf());

    /** 
     * Checks heuristically if the transaction and payment match each other
     */
    function tp_match(reference, transaction, payment) {
	if (transaction.reference == payment.reference) {
	    console.log("Matched with ref: " + reference);
	    return 1;
	}

	if (transaction.amount != payment.amount) {
	    console.log("Different amounts: " +
			transaction.amount + " ≠ " + payment.amount);
	    return 0;
	}
	const tdate = transaction.date.valueOf();
	const pdate = payment.payment_date.valueOf();
	if (Math.abs(tdate - pdate) <= DATE_EPSILON) {
	    console.log("Matched with date: " + reference);
	    return 1;
	}
	return 0;
    }

    /**
     * Adds backing transactions to the invoice payments 
     */
    function transactions2payments(T, invoice) {
	const reference = invoice.invoice.reference;
	const transactions = T.findByReference(reference);
	if (transactions.length == 0) {
	    console.log("No bank transactions found for " + reference);
	    return 0;
	}

	// Filter out manully entered payments with illegal amounts
	const payments = invoice.invoice.payments
	      .filter((payment) => (payment.amount > 0 && payment.amount < 10000));
	if (payments.length == 0) {
	    console.log("No payments found for " + reference);
	    return 0;
	}

	/*
	 * If there is just one transaction and one payment,
	 * they are most probably the same.  As this is the 
	 * common case, we optimise for this and also relax
	 * the maching requirements
	 */
	if (transactions.length == 1 && payments.length == 1) {
	    const transaction = transactions[0];
	    const payment = payments[0];

	    if (tp_match(reference, transaction, payment)) {
		payment.transaction = transaction;
		return 1;
	    }
	    console.log("Could not match transaction and payment: ");
	    console.log(transaction);
	    console.log(payment);
	    return 0;
	}

	/**
	 * There are more than one payments (or transactions).  Have
	 * to find out which of them are the matching ones.
	 */
	payments.forEach(
	    // Try to add transactions to each
	    (payment) => {
		const matching_transactions =
		      transactions.filter(
			  (transaction) => tp_match(reference, transaction, payment)
		      );
		if (matching_transactions.length == 0) {
		    console.log("Could not find any matching transactions");
		    console.log(transactions);
		    console.log(payment);
		} else if (matching_transactions.length == 1) {
		    console.log("Matched with exclusion");
		    payment.transaction = matching_transactions[0];
		} else {
		    console.log("Found multiple matching transactions");
		    console.log(matching_transactions);
		    console.log(payment);
		}
	    }
	);

	return 0;
    }

    assert(member.member.invoices);

    // Iterate over the invoices array of this member
    DataStream.fromArray(member.member.invoices)

        // Convert member invoice objects to promises of
        // the actual invoices,  adding the due amount and status
	.map(
	    (i) => fetch.invoice(i.id)
		.then(
		    (inv) => (
			inv.due_amount = i.due_amount,
			inv.status     = i.status,
			inv
		    )
		)
	)

        // Augment the invoice payments with transactions
	.each((inv) => transactions2payments(transactions, inv))

        // XXX Continue here

        //.map(console.log)
    ;


    return true;
}

/**
 * Checks the total balance of all members' invoices
 * @param members      A Scramjet Stream of member objects
 * @param transactions A Scramjet Stream of bank transactions
 * @return A Scramejet Stream of members who have paid too much or too little
 */
async function check_members_payments(members, transactions) {
    (await members).filter(
	// Check invoices balance for this member, return true/false
	member => check_member_payments(member, transactions)
    );
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

	case 'payments':
	    const members      = fetch.members(config.group);
	    const transactions = new Transactions()
	    transactions.from(argv.f).then(() =>
		{
		    check_members_payments(members, transactions).then(
			problems => problems
//			    .stringify(JSON.stringify)
//			    .pipe(process.stdout)
		    );
		});
	    break;
	}
    });
}
