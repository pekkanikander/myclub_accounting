/**
 * Performs various kinds of crosschecks on myclub.fi and bank transactions data
 */

import assert       from 'assert';
import config       from 'config';
import {DataStream} from 'scramjet';

import * as fetch   from './fetch';
import Transactions from './transactions';
import logger       from './log';

/**
 * Generates a payment report for the given member
 */
function member_to_payment_report(member) {
    if (member.member) member = member.member;

    const result = undefined;
}

/**
 * Checks the total balance of a given member's invoces
 * @param member       A member object
 * @param transactions A Scramjet Stream of bank transactions
 * @returns 
 */
function associate_payments_transactions(member, transactions) {
    // Max four days of difference
    const DATE_EPSILON = Math.abs(new Date(1970, 0, 5, 0).valueOf());

    /** 
     * Checks heuristically if the transaction and payment match each other
     */
    function tp_match(reference, transaction, payment) {
	if (transaction.reference == payment.reference) {
	    logger.info("Matched with ref: " + reference);
	    return 1;
	}

	if (transaction.amount != payment.amount) {
	    logger.info("Different amounts: " +
			transaction.amount + " ≠ " + payment.amount);
	    return 0;
	}
	const tdate = transaction.date.valueOf();
	const pdate = payment.payment_date.valueOf();
	if (Math.abs(tdate - pdate) <= DATE_EPSILON) {
	    logger.info("Matched with date: " + reference);
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
	    logger.info("No bank transactions found for " + reference);
	    return 0;
	}

	// Filter out manully entered payments with illegal amounts
	const payments = invoice.invoice.payments
	      .filter((payment) => (payment.amount > 0 && payment.amount < 10000));
	if (payments.length == 0) {
	    logger.info("No payments found for " + reference);
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
	    logger.info("Could not match transaction and payment: ");
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
		    logger.info("Could not find any matching transactions");
		    logger.debug(transactions);
		    logger.debug(payment);
		} else if (matching_transactions.length == 1) {
		    logger.info("Matched with exclusion");
		    payment.transaction = matching_transactions[0];
		} else {
		    logger.info("Found multiple matching transactions");
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

    logger.debug("Checking member " + member.member.id);

    assert(member.member.invoices);

    // Iterate over the invoices array of this member
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
    ;

    return member;
}

/**
 * Checks the total balance of all members' invoices
 * @param members      A Scramjet Stream of member objects
 * @param transactions A Scramjet Stream of bank transactions
 * @return A Scramejet Stream of members who have paid too much or too little
 */
function check_members_payments(members, transactions) {
    members
	.map(member => associate_payments_transactions(member, transactions))
	// .stringify(member_to_payment_report)
    ;
}

/**
 * Handle options when used directly from command line
 */
if (typeof require !== 'undefined' && require.main === module) {

    process.on('unhandledRejection', function(reason, p) {
	logger.error('Unhandled Rejection at:', p, 'reason:', reason);
	throw reason;
    });

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
}
