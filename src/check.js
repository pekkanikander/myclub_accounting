/**
 * Performs various kinds of crosschecks on myclub.fi and bank transactions data
 */

'use strict';

import assert       from 'assert';
import config       from 'config';
import     fs from 'fs';

import {DataStream} from 'scramjet';
import render       from 'jsrender';

import * as fetch   from './fetch';
import Transactions from './transactions';
import Invoices     from './invoices';
import logger       from './log';

const template = render.templates(fs.readFileSync('./src/report.txt').toString());

/**
 * Generates a payment report for the given member
 */
function member_to_payment_report(member, invoices) {
    member.invoices = [];
    member.member.invoices.forEach(
	(invoice) => {
	    logger.info("Check: Looking up " + invoice.id);
	    const found_invoices = invoices.findById(invoice.id);
	    logger.info("Check: Invoice number = " + found_invoices.length);
	    found_invoices.forEach(
		(inv) => member.invoices.push(inv)
	    );
	}
    );

    return template.render(member);
}

/**
 * Checks the total balance of a given member's invoces
 *
 * Writes the augmented invoice objects to the invoice output stream.
 * @param member       A member object
 * @param transactions A Scramjet Stream of bank transactions
 * @param invoices     A Writable Stream of fetched invoices
 * @returns 
 */
function associate_payments_transactions(member, transactions, invoices) {
    // Max four days of difference
    const DATE_EPSILON = Math.abs(new Date(1970, 0, 5, 0).valueOf());

    /** 
     * Checks heuristically if the transaction and payment match each other
     */
    function tp_match(reference, transaction, payment) {
	if (transaction.reference == payment.reference) {
	    logger.debug('Check: ' + reference + ': Matched with reference');
	    return 1;
	}

	if (transaction.amount != payment.amount) {
	    logger.warn('Check: ' + reference + ': Different amounts: ' +
			transaction.amount + ' ≠ ' + payment.amount);
	    return 0;
	}
	const tdate = transaction.date.valueOf();
	const pdate = payment.payment_date.valueOf();
	if (Math.abs(tdate - pdate) <= DATE_EPSILON) {
	    logger.info('Check: '  + reference + ': Matched with date');
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
	    logger.info('Check: ' + reference + ': No bank transactions found');
	    return 0;
	}

	// Filter out manully entered payments with illegal amounts
	const payments = invoice.invoice.payments
	      .filter((payment) => (payment.amount > 0 && payment.amount < 10000));
	if (payments.length == 0) {
	    logger.warn('Check: '  + reference + ': No payments found');
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
	    logger.warn('Check: ' + reference + ': Could not match transaction and payment');
	    logger.debug(transaction);
	    logger.debug(payment);
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
		    logger.warn('Check: ' + reference + ': Could not find any matching transactions');
		    logger.debug(transactions);
		    logger.debug(payment);
		} else if (matching_transactions.length == 1) {
		    logger.info('Check: ' + reference + ': Matched with exclusion');
		    payment.transaction = matching_transactions[0];
		} else {
		    logger.warn('Check: ' + reference + ': Found multiple matching transactions');
		    logger.debug(matching_transactions);
		    logger.debug(payment);
		    payment.transactions = matching_transactions;
		}
	    }
	);

	return 0;
    }

    /**
     * Differentiate simply matching invoices from complex ones
     *
     * A simple invoice must have:
     * 1. must be exactly one payment
     * 2a) payment must be annotated with exactly one transaction
     *   - amounts must match
     * or 
     * 2b) payment must be written by the bank matching
     */
    function isSimplyPaid(invoice) {
	if (invoice.invoice.payments.length != 1) return false;

	const payment     = invoice.invoice.payments[0];
	const transaction = payment.transaction;

	// If the payment has a matching reference, it is automatically matched
	if (payment.reference == invoice.invoice.reference) return true;

	// Otherwise the payment must be matched with a transaction
	if (!transaction) return false;

	// The amount of the transaction and the payment must be euql
	if (transaction.amount != payment.amount) return false;

	// Good enough, accept this a simply paid
	return true;
    }
    
    /**
     * Check that all payments have exactly one transaction
     * @returns falsy on all ok, non-zero on something needing investigation
     */
    function verifyAllPayments(invoice) {
	// If there are no good payments
	if (!invoice.payments || invoice.payments.length == 0) {
	    return -1;
	}

	// Filter out all "good" payments, leave "bad" ones
	const bad_payments = invoice.payments.filter(
	    (payment) => {
		XXX;
	    }
	);

	return XXX;
    }

    logger.debug('Check: Checking member ' + member.member.id);

    assert(member.member.invoices);

    // Iterate over the invoices array of this member
    return new Promise((res, rej) => {
	DataStream.fromArray(member.member.invoices)

            // Convert member invoice objects to promises of
            // the actual invoices,  adding the due amount and status
	    .map(
		(i) => fetch.invoice(i.id)
		    .reduce((out, inv) => (
			inv.due_amount = i.due_amount,
			inv.status     = i.status,
			inv
		    ), undefined)
	    )

            // Augment the invoice payments with transactions
	    .each((inv) => transactions2payments(transactions, inv))

            // Feed to the invoices DB
	    .pipe(invoices)

	    // When everything is ready,
	    // resolve the promise, returning the member to the pipe
	    .on('finish', () => {
		logger.debug("Check: Finished member " + member.member.id);
		res(member);
	    });

    });
}

/**
 * Checks the total balance of all members' invoices
 * @param members      A Scramjet Stream of member objects
 * @param transactions A Scramjet Stream of bank transactions
 * @return A Scramejet Stream of members who have paid too much or too little
 */
function check_members_payments(members, transactions) {

    const invoices = new Invoices();

    invoices.setMaxListeners(100); // XXX Why we need this much?

    /*
     * Associates transactions with member payments and
     * pipes the related invoices to Invoices DB
     */
    members
	.map(       member => (associate_payments_transactions(member, transactions, invoices), member))
	.stringify( member => member_to_payment_report(member, invoices))
	.map(console.log)
    ;
}

/**
 * Handle options when used directly from command line
 */
if (typeof require !== 'undefined' && require.main === module) {

    process.on('unhandledRejection', function(reason, p) {
	logger.error('Check: Unhandled Rejection at:', p, 'reason:', reason);
	throw reason;
    });

    try {
	const argv = require('minimist')(process.argv.slice(2));
	argv._.forEach(async function (keyword) {
	    switch(keyword) {
		
	    case 'payments':
		const members      = fetch.members(config.group);
		const transactions = new Transactions()
		transactions.from(argv.f).then(() => {
		    check_members_payments(members, transactions)
		    ;
		});
		break;
	    }
	});
    } catch (e) {
	console.log(e);
    }
}
