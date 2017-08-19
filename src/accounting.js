
import minimist   from 'minimist';

const     argv  = minimist(process.argv.slice(2));
const filename  = argv._[0];

import          fs  from 'fs';
import       parse  from 'csv-parse';
import   stringify  from 'csv-stringify';
import       iconv  from 'iconv-lite';
import {DataStream} from 'scramjet';

import      unify from 'heya-unify';

unify.preprocess  = require('heya-unify/utils/preprocess');
unify.assemble    = require('heya-unify/utils/assemble');
unify.matchString = require('heya-unify/unifiers/matchString');

const    valueDate = unify.variable('Päivämäärä'),
      counterParty = unify.variable('Saaja/maksaja'),
       description = unify.variable('Selite'),
         reference = unify.variable('Viite/Viesti'),
       valueAmount = unify.variable('Määrä EUR'),
      debetAccount = unify.variable('DebetTili'),
     creditAccount = unify.variable('KreditTili');

const transactionPattern = unify.open({
       ['Päivämäärä']: valueDate,
        ['Määrä EUR']: valueAmount,
    ['Saaja/maksaja']: counterParty,
           ['Selite']: description,
     ['Viite/Viesti']: reference
});

const AccountingTransaction = {
            Päivä: valueDate,
           Selite: description,
['Saaja/maksaja']: counterParty,
            Summa: valueAmount,
};

const accountingPatterns = [
    {
        match: {
            ['Saaja/Maksaja']: 'FUMAX OY KÄPYLÄN JALKAPALLOHALLI',
        },
        trans: { Debet: 103, Kredit: 101 }
    },
].map(pattern => (
    {
        match: unify.open(pattern.match),
        trans: Object.assign({}, AccountingTransaction, pattern.trans)
    }
));

/* ---------------------------------------- */

fs.createReadStream(
    filename
).pipe(
    iconv.decodeStream('ISO-8859-1')
).pipe(
    parse({
        delimiter: ';',
        columns: true,
        trim: true,
    })
).pipe(
    new DataStream()
).map(

    /*
     * Convert negative value amounts to positive
     */

    (transaction) => Object.assign(
	transaction,
	{
	    'Määrä':
	    Number.parseFloat(transaction['Määrä EUR'].replace(/,/,'.')).toFixed(2)
	}
    )

).map(

    /*
     * Convert bank transactions into accounting transactions
     */

    (transaction) => {
        // Find the accounting pattern(s) that match with the back transaction
        const aPattern = accountingPatterns.find(
            pattern => unify(pattern.match, transaction) != null
        );
        if (aPattern == null) {
            console.log(transaction);
            throw new Error('Define new pattern for transaction ' + transaction);
        }

        // Match the bank transaction against the pattern, binding variables
        const tEnv = unify(transaction, transactionPattern);
        // Construct an accounting transaction using the bindings
        return unify.assemble(aPattern.trans, tEnv);
    }

).pipe(

    stringify({
	header: true,
	delimiter: ';',
	
    })

).pipe(process.stderr);

