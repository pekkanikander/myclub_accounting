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
import Members      from './members';
import logger       from './log';

const StartDate = new Date(config.start_date).valueOf();

const DateOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
render.views.converters(
    'd', (date) => ("        " + (new Date(date)).toLocaleString('fi-FI', DateOptions)).slice(-10));
render.views.converters(
    'f', (val) =>  ("        " + parseFloat(val).toFixed(2)).slice(-8));

render.views.settings.allowCode(true);
render.views.converters(
    'status',
    function(val) {
	switch (val) {
	case 'paid':     return 'maksettu';
	case 'overpaid': return 'liikaa  ';
	case 'overdue':  return 'myöhässä';
	}
	return val;
    }
);

const template = render.templates(fs.readFileSync('./src/report.txt').toString());




/**
 * Generates a payment report for the given member
 */
function member_to_payment_report(member) {
    try {
	if (member.invoices && member.invoices[0] && member.invoices[0].invoice) {
	    const i = member.invoices[0].invoice;
	    // console.log(i);
	}
        return template.render(member);
    } catch (error) {
        logger.error('Check: Render error: ' + error);
        throw error;
    }
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
            logger.debug('Check: reference ' + reference + ': Matched with reference');
            return 1;
        }

        if (transaction.amount != payment.amount) {
            logger.warn('Check: reference ' + reference + ': Different amounts: ' +
                        transaction.amount + ' ≠ ' + payment.amount);
            return 0;
        }
        const tdate = transaction.date.valueOf();
        const pdate = payment.payment_date.valueOf();
        if (Math.abs(tdate - pdate) <= DATE_EPSILON) {
            logger.info('Check: reference '  + reference + ': Matched with date');
            return 1;
        }
        return 0;
    }

    /**
     * Adds backing transactions to the invoice payments 
     */
    function transactions2payments(T, invoice) {
        const reference = invoice.reference;
        const transactions = T.findByReference(reference);
        if (transactions.length == 0) {
            logger.info('Check: reference ' + reference + ': No bank transactions found');
            return 0;
        }

        // Filter out manully entered payments with illegal amounts
        const payments = invoice.payments
            .filter((payment) => (payment.amount > 0 && payment.amount < 10000));
        if (payments.length == 0) {
            logger.warn('Check: reference '  + reference + ': No payments found');
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
            logger.warn('Check: reference ' + reference + ': Could not match transaction and payment');
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
                    logger.warn('Check: reference ' + reference + ': Could not find any matching transactions');
                    logger.debug(transactions);
                    logger.debug(payment);
                } else if (matching_transactions.length == 1) {
                    logger.info('Check: reference ' + reference + ': Matched with exclusion');
                    payment.transaction = matching_transactions[0];
                } else {
                    logger.warn('Check: reference ' + reference + ': Found multiple matching transactions');
                    logger.debug(matching_transactions);
                    logger.debug(payment);
                    payment.transactions = matching_transactions;
                }
            }
        );

        return 0;
    }

    function transactions2payments4map(transactions, invoice) {
        try {
            const r = transactions2payments(transactions, invoice);
        } catch (error) {
            logger.error('Check: Error: ' + error);
        }
        return Promise.resolve(invoice);
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
     * /
    function isSimplyPaid(invoice) {
        if (invoice.payments.length != 1) return false;

        const payment     = invoice.payments[0];
        const transaction = payment.transaction;

        // If the payment has a matching reference, it is automatically matched
        if (payment.reference == invoice.reference) return true;

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
     * /
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
*/

    logger.debug('Check: member '  + member.id + ': Checking');

    assert(member.invoices);

    // Iterate over the invoices array of this member
    return new Promise((resolve, reject) => {
        try {
            DataStream.fromArray(member.invoices)

            // Convert member invoice objects to promises of
            // the actual invoices,  adding the due amount and status
                .map(
                    (i) => fetch.invoice(i.id)
                        .reduce((out, inv) => (
                            inv.invoice.due_amount = i.due_amount,
                            inv.invoice.status     = i.status,
                            inv.invoice
                        ), undefined)
                )

            // Augment the invoice payments with transactions
                .map((inv) => transactions2payments4map(transactions, inv))

            
            // When everything is ready,
            // resolve the promise, returning the member to the pipe
                .on('end', () => {
                    logger.debug('Check: member '  + member.id + ': Finished');
                    try {
                        resolve(member);
                    } catch (error) {
                        logger.error('Check: error: ' + error);
                        reject(error);
                    }
                })

                .on('error', (error) => {
                    logger.error('Check: error: ' + error);
                    reject(error);
                })

            // Feed to the invoices DB
                .pipe(invoices, { end: false })
                .on('error', (error) => {
                    logger.error('Check: error: ' + error);
                    reject(error);
                });
            
        } catch (error) {
            logger.error('Check: error: ' + error);
            reject(error);
        }
    });
}

/**
 * Checks the total balance of all members' invoices
 * @param members      A Scramjet Stream of member objects
 * @param transactions A Scramjet Stream of bank transactions
 * @return A Scramejet Stream of members who have paid too much or too little
 */
function check_members_payments(members, transactions) {

    const invoicesTable = new Invoices();
    const membersTable = new Members();

    invoicesTable.setMaxListeners(100); // XXX Why we need this much?

    /**
     * Iterate over member's invoices
     */
    function memberMapInvoices(member, func) {
        return Object.assign({}, member, { invoices: member.invoices.map(func) });
    }

    function memberFilterInvoices(member, func) {
	return Object.assign({}, member, { invoices: member.invoices.filter(func) });
    }

    function invoiceCheck(invoice) {
	if (!invoice.invoices) {
	    logger.error('Check: invoice: no real invoice found: ' + invoice.id);
	    return;
	}
	if (invoice.invoices.length != 1) {
	    logger.error('Check: invoice: more than one real invoices: ' + invoice.id);
	    return;
	}

	// Replace the table with its only object
	const newInvoice = Object.assign({}, invoice);
	newInvoice.invoice = invoice.invoices[0];
	newInvoice.invoices = undefined;
	
	// Create a pseudo-transaction for confirmed payment objects
	newInvoice.invoice.payments.forEach(
	    (payment) => {
		payment.transaction = payment.transaction ||
		    {
			date:      payment.payment_date,
			payee:     payment.payer,
			type:      payment.comment,
			reference: payment.reference,
			amount:    payment.amount,
		    }
	    }
	);

	return newInvoice;
    }

    function memberCollectTransactions(member) {
	const newMember = Object.assign(
	    {}, member,
	    {
		transactions: member.invoices.reduce(
		    (transactions, invoice) => transactions.concat(
			(invoice.invoice? invoice.invoice.payments: []).reduce(
			    (transactions, payment) => transactions.concat(
				payment.transaction? [payment.transaction]: []
			    ), []
			)
		    ), []
		)
	    });
	// XXX Add non-assigned transactions
	return newMember;
    }

    function memberComputeTotals(member) {
	return Object.assign(
	    {}, member,
	    {
		invoiced_total:
		member.invoices.reduce(    (sum, invoi) => (sum + parseFloat(invoi.due_amount)), 0),
		paid_total:
		member.transactions.reduce((sum, trans) => (sum + trans.amount), 0),
	    }
	);
    }

    /*
     * Associates transactions with member payments and
     * pipes the related invoices to InvoicesTable DB
     */
    members
        .map(member => (associate_payments_transactions(member.member, transactions, invoicesTable)))
        .on('error', (error) => logger.error('Check: error: ' + error))
        .pipe(membersTable)
        .on('finish', () => {
            logger.info('Check: start second phase');
            membersTable
                ._collection // XXX
                .chain()
                .data()
	    // Take only players and goal keepers
		.filter(
		    member => !!(member.memberships.filter(
			ms => (ms.level == 'Pelaaja' || ms.level == 'Maalivahti')
		    ))
		)
	    // Filter out old invoices
		.map(
		    member => memberFilterInvoices(
			member, inv => new Date(inv.due_date).valueOf() > StartDate
		    )
		)
	    // Combine with invoice objects
                .map(member => memberMapInvoices(
		    member, inv => Object.assign(
                        {}, inv, { invoices : invoicesTable.findById(inv.id) }
		    )
		))
	    // Combine with transaction objects
		.map(member => memberMapInvoices(member, invoiceCheck))
	    // Collect transactions to the member level
		.map(member => memberCollectTransactions(member))
	    // Calculate sums
		.map(member => memberComputeTotals(member))
	    // Create report
                .map(member_to_payment_report)
                .map(report => console.log(report));
        })
        .on('error', (error) => {
            logger.error('Check: error: ' + error);
        })
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
        argv._.forEach(function (keyword) {
            switch(keyword) {
                
            case 'payments': {
                const members      = fetch.members(config.group);
                const transactions = new Transactions();
                transactions.from(argv.f).then(() => {
                    check_members_payments(members, transactions)
                    ;
                });
                break;
            }
            }
        });
    } catch (e) {
        logger.error('Check: Unhandled exception: ' + e);
    }
}
