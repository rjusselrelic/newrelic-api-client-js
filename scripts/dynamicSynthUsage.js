
// Synthetic Usage script to gather Adobe's Checks and differentiate between public and private minions.  This script utilizes the partner API to gather the current list of active acounts from all partnerships, and leverages a query to account 1 to gather the results.  As the scale of queries is quite large the number of queries are divided up into manageable queries and summed to give the full period (usually 1 month).

const config = require('config');
const partners = require('../lib/partners.js');
const insights = require('../lib/insights.js');
const helper = require('../lib/helper.js');
const json2csv = require('json2csv');
const fs = require('fs');
// NRQL Query that will be used on Account 1 to gather Synthetic Checks and Facet by "Private vs Public"minions
const nrql = "SELECT filter(count(*), where isPrivateLocation is TRUE) as 'Private Location Checks',filter(count(*), where isPrivateLocation is FALSE) as 'Private Location Checks' FROM Synthetics WHERE jobStatus != 'SOFT_FAILED' and jobType != 'SIMPLE' AND error not like '%Internal Engine%' WITH TIMEZONE 'America/Los_Angeles' facet account limit 1000";
var acctClause = " WHERE account IN (ACCT_LIST_HERE) ";

//Setting up Time Period
var start = new Date("5/1/2018 00:00:00");
var end = new Date("6/1/2018 00:00:00");
var beginTime = start.getTime();
var endTime= end.getTime();
var queryDays =7;
var queryPeriod = 1000 * 60 * 60 *24*queryDays;
var expectedQ = Math.ceil((endTime - beginTime)/queryPeriod);
var query = 0;
var pAcctList= {};

var configArr = config.get('configArr');
var configId = configArr[0];
var partArr = config.get('partArr');
var totalResults = [];
var retrys = {};


// This gets run at the end to write out the complete CSV
var finalizeUsage = function() {
  console.log('Usage data found for ' + totalResults.length + ' accounts');
  var input = {
    data: totalResults,
    fields: ['partnership', 'accountId', 'privateChecks','publicChecks'],
    fieldNames: ['Partnership', 'Account ID', 'Private Checks','Public Checks']
  }
  json2csv(input, function(csvErr, csvData) {
    if (csvErr) {
      console.log('ERROR preparing CSV file!');
      console.log(csvErr);
    } else {
      var fname = 'synthetic-usage-' + new Date(start).toISOString().split('T')[0]+ '.csv';
      console.log('Writing usage data to: ' + fname);
      fs.writeFile(fname, csvData, function(fileErr) {
        if(fileErr) {
          return console.log(fileErr);
        }
      });
    }
  });
}
var addResults = function(results) {
    //console.log("Sum Results...");
    //for(var i ; i < results.length; i++){
    results.forEach(function(i){
        //console.log('processing: '+acct);
        let obj = totalResults.find((o,index) => {
            if (i.accountId === o.accountId) {
 //             console.log(o);
 //             console.log('Updating AcctID: '+i.accountId);
 //             console.log('Adding'+i.publicChecks+ ' To '+o.publicChecks);

              o.privateChecks += i.privateChecks;
              o.publicChecks += i.publicChecks;
              return true;
            }
        });
    
        if (!obj){
  //          console.log('adding new account to total: '+i.accountId);
            totalResults.push(i);
        }
    });
    query++;
    if (query == expectedQ){finalizeUsage()};
}

var runUsageQuery = function(fullNrql,configId,beginTime,cb) {
  insights.query(fullNrql, configId, function(error, response, body) {
    console.log('Validating Data from: ' + new Date(beginTime).toLocaleString() + ' Query');
    //console.log('Status Code: '+response.statusCode);
    if (!body.error & response.statusCode == 200) {
      var usedResult = [];
      var resultBody = helper.handleCB(error, response, body);
      var accountResult = {};
      
      var facets = resultBody.facets;
      var acctCount= facets.length;
       console.log('Found ' + acctCount+ ' accounts with synthetics running.');
      for (var f = acctCount - 1; f >= 0; f--) {
        var partnership = 'Not Found';
        for (partner in pAcctList) {
            pAcctList[partner].forEach(function(acctName){
                  if (parseInt(facets[f].name) == acctName) {
                    //console.log('Setting partnership to: '+partner);
                    partnership = partner;
                  }

            });

            //Why the hell doesn't this work?! Long way above ^
            //console.log('AcctId Type: '+typeof facets[f].name);
            //console.log('partnerlist Type: '+typeof pAcctList[partner]);
            //console.log('Partner: '+partner +'  AccountList: '+pAcctList[partner]);
            //if (pAcctList[partner].includes(parseInt(facets[f.name])) > -1  ){
                //console.log('Setting partnership to: '+partner);
                //partnership = partner;
            //}
        };
        
        var usedInfo = {
          'partnership': partnership,
          'accountId': facets[f].name,
          'privateChecks': facets[f].results[0].count,
          'publicChecks': facets[f].results[1].count
        }
        usedResult.push(usedInfo);
      };
      //console.log('Leaving \'runUsageQuery\' function (sending usedResult)');
      return cb(usedResult);
    } else {

         console.log('Status Code: '+response.statusCode);
         //console.log('Body: '+body);
         console.log('Insights Error: '+body.error);
         //console.error(response);
        //Retry Each query up to 3 Times
        if (retrys[beginTime] < 3){
            console.log('Retrying query. Attempt #' +(retrys[beginTime] + 1 )  );
            setTimeout(function() {
                runUsageQuery(fullNrql,configId,beginTime,addResults);
            },30000);
            retrys[beginTime]+=1;
        }
        else{
         console.log('Query Failed: ' + fullNrql);
         console.log('Error: '+body.error);
         console.log('Query Retried '+retrys[beginTime]+1+' times and still failed.');
         console.log('Try running the above query manually on account 1, or wait a while longer and see if it works... The wonders of Insights may amaze you.');
         console.log('Another option may be to reduce the number of days "queryDays" variable.');
        }
    }
  });
}
var splitQueries = function (beginTime,accts,cb){
    acctClause = acctClause.replace(/ACCT_LIST_HERE/, accts);
    //console.log('Dynamically created account list: '+acctClause);

    endPeriod = beginTime +queryPeriod;
    if (endPeriod > endTime) {
        endPeriod = endTime;
    }

    var since = ' SINCE '+beginTime + ' UNTIL '+ endPeriod;
    console.log('Running Query: SINCE '+new Date(beginTime).toLocaleString() + ' UNTIL '+ new Date(endPeriod).toLocaleString());
    var fullNrql = nrql + acctClause +  since;
    // set retries for each query
    retrys[beginTime]=0;
    runUsageQuery(fullNrql,configId,beginTime,addResults);
    beginTime += queryPeriod;
    if (endPeriod < endTime) {
       splitQueries(beginTime);
    }
   
   

}

console.log('Checking Synthetic Usage from: '+start.toLocaleString()+' until ' +end.toLocaleString()+'.'); 
console.log('Queries split into '+queryDays+' day chunks to handle scale. -- Running '+expectedQ+' Queries.');

//Call Partners API to get latest list of Active Accounts
partners.getAccts(partArr,function(acctList){
    pAcctList= acctList;
    var acctString = '';
    //console.log('Partnership: '+ partnership);
    for (partner in acctList) {
        acctString +=acctList[partner].slice(0, -1).join(',');
        acctString+=',';
    }
    acctString = acctString.replace(/,\s*$/, "");
    //Split Queries and Call Insights (Account 1)
    splitQueries(beginTime,acctString,finalizeUsage);

});


