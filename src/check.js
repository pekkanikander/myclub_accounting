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

const template = render.templates(fs.readFileSync('./src/report.txt').toString());

/**
 * Generates a payment report for the given member
 */
function member_to_payment_report(member) {
    member.invoices = [];

    try {
        if (member.invoices[0])
            console.log(member.invoices[0].invoice);
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
        const r = transactions2payments(transactions, invoice);
        return new Promise((res, rej) => res(invoice));
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

    logger.debug('Check: member '  + member.id + ': Checking');

    assert(member.invoices);

    // Iterate over the invoices array of this member
    return new Promise((res, rej) => {
        try {
            const s = DataStream.fromArray(member.invoices)

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
            ;
            
            // When everything is ready,
            // resolve the promise, returning the member to the pipe
            s.on('end', () => {
                logger.info('Check: member '  + member.id + ': Finished');
                res(member);
            });

            // Feed to the invoices DB
            s.pipe(invoices);
        } catch (err) {
            rej(err);
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

    /*
     * Associates transactions with member payments and
     * pipes the related invoices to InvoicesTable DB
     */
    members
        .map(member => member.member)
        .map(member => (associate_payments_transactions(
            member, transactions, invoicesTable), member))
        .pipe(membersTable)
        .on('close', () => {
            logger.info('Check: start second phase');
            membersTable
                ._collection // XXX
                .chain()
                .data()
                .map(
                    member => {
                        member.invoices
                            .forEach(
                                si => si.invoice = invoicesTable.findById(si.id)
                            );
                        return member;
                    }
                )
                .map(member_to_payment_report)
                .map(report => console.log(report));
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
