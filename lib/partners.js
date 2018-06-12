const request = require('request');
const config = require('config');
const helper = require('./helper.js');
const urls = require('./api-urls.json');

// Define the initial API
var partners = {};

partners.list = function (page, configId, cb) {
  var partnerId = config.get(configId + '.partnerId');
  var url = urls.api.partner.list.replace('{partner_id}', partnerId);
  
  // Page 1 is the default
  if (page == null) {
    page = 1;
  }
  
  var qs = {
    'page': page
  }
  helper.sendGetQSRequest(url, qs, configId, cb);
}
partners.getAccts= function (partnerList,cb){
    var partList = {};
    var i = 0;
    // iterate through the list of provided partner IDs
    partnerList.forEach(function (configId){
    var acctList =[];
      partnerName = configId;
      //console.log("Processing partnerId: " + configId);
      partners.list(1, configId, function(error, response, body) {
        if(response.statusCode == 200) {
          var statusFilters = /cancelled|pending|suspended/;
          var activeAccounts = body.accounts;
          // Filter out non-active accounts
          activeAccounts = activeAccounts.filter(val => val.status.search(statusFilters) == -1);
          activeAccounts.forEach(function(acct){
              acctList.push(acct.id);

          });
          //console.log(configId + ' Active Accounts: '+acctList.length);
          i++;
          partList[configId] = acctList;
            if (i == partnerList.length) {
                //console.log('Returning Partner List');
                return cb(partList);
            }
        }
        else {
          console.log('error: '+ response.statusCode);
          //console.log(body);
        }
      });
    });
}


module.exports = partners;
