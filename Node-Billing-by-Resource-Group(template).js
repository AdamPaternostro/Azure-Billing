// Author: Adam Paternostro

// Requirements: node.js installed
//               Azure Service principle created https://azure.microsoft.com/en-us/documentation/articles/resource-group-create-service-principal-portal/

// You need to complete these variables:
// Service Principle:   client_id, tenant_id, client_secret, subscription_id
// Billing Dates:       billing_start_date, billing_end_date
// Azure Pricing Offer: offer

var https = require("https");
var querystring = require("querystring");
var util = require("util");

////////////////////////////
// Makes a REST call
////////////////////////////
function performRequest(host, path, method, header, data, success) {
     var options = {
        host: host,
        port: 443,
        path: path,
        method: method,
        headers: header
    };

    console.log("performRequest", host);

    var req = https.request(options, function(res) {
        //res.setEncoding("utf-8");
        //console.log("statusCode: ", res.statusCode);
        //console.log("headers: ", res.headers);

        var responseString = "";

        res.on("data", function(data) {
            //console.log("res.on data",data);
            responseString += data;
        });

        res.on("end", function() {
           //console.log("res.on end");
           if (responseString && responseString !== "null" && responseString !== "undefined") {
                //console.log("res.on end responseString",responseString);
                var responseObject = JSON.parse(responseString);
                success(responseObject);
            } else {
                //console.log("res.on end (empty)");
                var a = { success : true};
                success(a);                
            }
          
        });
    });

    if (JSON.stringify(data) != JSON.stringify({})) {
        //console.log("Sending Body 1:", data);
        req.write(data);
    }
    else
    {
        var emptyJson =  JSON.stringify(data);
        //console.log("Sending Body 2:", emptyJson);
        req.write(emptyJson);       
    }
    //console.log("Request end 1");
    req.end();

    req.on('error', (e) => {
    console.error("performRequest Error: ", e);
    });
} // performRequest


////////////////////////////
// Calculate the billing per resource group
////////////////////////////
function caculateResults(usageDataList, rateCardData, success)
{
    console.log("Call to caculateResults");
    var results = [];
    var usageData = null;

    var meterId = null;
    var instanceData = null;
    var resourceGroup = null;
    var quantity = null;
    var index = 0;
    var meterRate = null;

    var total = null;
    var found = false;
    var grandTotal = 0;

    // used for parsing strnig
    // '{\"Microsoft.Resources\":{\"resourceUri\":\"/subscriptions/64a14e46-6c7d-4063-9665-c295287ab709/resourceGroups/Sample.Azure.Functions/providers/Microsoft.Web/sites/sampleazurefunctions\",\"location\":\"westus\"';
    var resourceGroupsIndex= 0;
    var resourcegroupsText="/resourcegroups/";
    var providersIndex= 0;
    var providersText="/providers/"
    var start = 0;
    var stop = 0;
    
    //console.log("usageData:", usageData);
    //console.log("rateCardData:", rateCardData);
   
    // loop through each set of usage data downloaded.  We downloaded many files.
    var i = 1;
    for (var arrayKey in usageDataList)
    {
        usageData = usageDataList[arrayKey];
        for (var key in usageData.value)
        {
            meterId = usageData.value[key].properties.meterId;
            instanceData = usageData.value[key].properties.instanceData;
            quantity = usageData.value[key].properties.quantity;
            
            if (instanceData == "undefined" || instanceData == undefined)
            {
                resourceGroup = "n/a";
            }
            else
            {
                // resourceGroup
                instanceData = instanceData.toLowerCase();

                resourceGroupsIndex = instanceData.indexOf(resourcegroupsText);
                providersIndex = instanceData.indexOf(providersText);

                //console.log("resourceGroupsIndex:", resourceGroupsIndex);
                //console.log("providersIndex:", providersIndex);

                start = resourceGroupsIndex + resourcegroupsText.length;
                //console.log("start: ", start);

                stop = providersIndex - resourceGroupsIndex - resourcegroupsText.length
                //console.log("stop : ", stop);

                resourceGroup = instanceData.substr(start,stop);
            }

            // console.log("meterId: ", meterId);
            // console.log("resourceGroup: ", resourceGroup);
            // console.log("quantity: ", quantity);

            meterRate = "0";
            for (var rateKey in rateCardData.Meters)
            {
                if (rateCardData.Meters[rateKey].MeterId == meterId)
                {
                    meterRate = rateCardData.Meters[rateKey].MeterRates["0"];
                    break;
                }
            }

            // console.log("meterRate: ", meterRate);

            total = parseFloat(meterRate) * parseFloat(quantity);
            grandTotal = grandTotal + total;
 
            found = false;
            for (var resultKey in results)
            {
                if (results[resultKey].resourceGroup == "undefined" || results[resultKey].resourceGroup == undefined)
                {
                    console.log ("break");
                    break;
                }
                if (results[resultKey].resourceGroup == resourceGroup)
                {
                    //console.log ("FOUND");
                    results[resultKey].total = results[resultKey].total + total;
                    found = true;
                    break;
                }
            }
            if(!found)
            {
                results.push({ resourceGroup: resourceGroup, total: total });
            }

            i = i + 1;
            //if (i > 10) break;

        } // for..loop usageData

    } // for..loop usageDataList

    success(results, grandTotal);
} // caculateResults


function getSingleUsage(usageUrl, authHeader, success)
{
    console.log("Downloading usage data");
    //console.log("getSingleUsage ", usageUrl);

    performRequest(
        "management.azure.com",
        usageUrl,
        "GET",
        authHeader,
        {},
        function(usageData) {
            success(usageData, false, null);
        } 
    );
} // getSingleUsage


function getUsage(usageUrl, authHeader, callback) {
  var listOfUsage = [];
  //console.log("getUsage ", usageUrl);

  (function getOneUsage() {  
    try {
        getSingleUsage(usageUrl, authHeader,
            function(data, hasError, err) {
                // console.log("DATA::::: ", data);
                if (hasError) { callback(null, true, err); return }

                if (data.nextLink == "undefined" || data.nextLink == undefined) {
                    // console.log("getUsage nextLink ",data.nextLink);
                    listOfUsage.push(data);
                    callback(listOfUsage, false, null);
                } else {
                    // console.log("getUsage nextLink ",data.nextLink);
                    usageUrl = data.nextLink;
                    listOfUsage.push(data);
                    getOneUsage();
                }
        });
    }  catch (exception) {
        console.log("ERROR::", exception) ;
        callback(null, true, exception);
    }
  })
  ();
} // getUsage


function postResourceTag(i, url, data, authHeader, success)
{
    console.log("postResourceTag:", url, data);
 
    performRequest(
        "management.azure.com",
        url,
        "PUT",
        authHeader,
        data,
        function(resultData) {
            success(resultData, false, null);
        } 
    );
} // postResourceTag


function setTagsOnResouceGroupSerial(i, billingByResourceGroup, subscription_id, access_token, callback) {
    var listOfUsage = [];

  (function processOneTag() {
     
    try {
        var tagData = null;
        var header = null
        var url = null;
        var existingTags = [];
       //console.log("i: ", i);

       resourceBill = billingByResourceGroup[i];
        
       // jump over n/a
       if (resourceBill.resourceGroup == "n/a"){
               // console.log("billingByResourceGroup.length n/a", i);
               i = i + 1;
              // listOfUsage.push(data);
               processOneTag();           
       } 
       else
       {
            url = "/subscriptions/" + subscription_id +"/resourceGroups/" + resourceBill.resourceGroup + "?api-version=2016-02-01";
            headers = {
                "x-ms-version": "2016-02-01",
                "Authorization":  "Bearer " + access_token
                };

            // GET https://management.azure.com/subscriptions/64a14e46-6c7d-4063-9665-c295287ab709/resourcegroups/Sample.Base?api-version=2016-02-01
            performRequest(
                "management.azure.com",
                url,
                "GET",
                headers,
                {},
                function(resouceData) {                   
                    // https://management.azure.com/subscriptions/64a14e46-6c7d-4063-9665-c295287ab709/resourceGroups/Sample.Base?api-version=2015-01-01";
                    url = "/subscriptions/" + subscription_id +"/resourceGroups/" + resourceBill.resourceGroup + "?api-version=2015-01-01";

                   // console.log("resouceData:: ", resouceData);

                    var found = false;                    
                    for (var tagKey in resouceData.tags)
                    {
                        //console.log("tagKey", tagKey);
                        //console.log("resouceData.tags[tagKey]", resouceData.tags[tagKey]);
                        
                        if (resouceData.tags[tagKey] != undefined || resouceData.tags[tagKey] == "undefined")
                            {
                            if (tagKey == "billingSpend")
                                {
                                existingTags.push( { billingSpend :  resourceBill.total.toString() } );                                                 
                                found = true;
                                }
                            else
                                {
                                    var jsonVariable = {};
                                    var jsonKey  = tagKey;
                                    jsonVariable[tagKey] = resouceData.tags[tagKey].toString();
                                    existingTags.push(jsonVariable);                                      
                               }
                            }
                    }
                    if (!found)
                    {
                         existingTags.push({billingSpend :  resourceBill.total.toString()});                   
                    }
                
                    console.log("resouceData.location:", resouceData.location);
                
                    tagData = { location: resouceData.location, tags : existingTags }

                    // Not sure why it is not expecting an Array, but this is what the call wants:
                    // tags:{ {"tagKey":"washere"},{"billingSpend":"0.000592128"}}
                    tagData = JSON.stringify(tagData);
                    tagData=tagData.replace("[","");
                    tagData=tagData.replace("]","");
                    tagData=tagData.replace("},{",",");  

                    //console.log("tagData::", tagData);

                    headers = {
                            "x-ms-version": "2015-01-01",
                            "Authorization":  "Bearer " + access_token,
                            "Content-Type": "application/json",
                            "Content-Length": tagData.length 
                            };
                
                    postResourceTag(i, url, tagData, headers,         
                        function(data, hasError, err) {
                        if (hasError) {
                                console.log("ERROR::", err) ;
                                callback(null, true, err);
                                return 
                            }

                            if (billingByResourceGroup.length - 1 == i) {
                                listOfUsage.push(data);
                                callback(listOfUsage, false, null);
                            } else {
                                i = i + 1;
                                listOfUsage.push(data);
                                processOneTag();
                            }
                    }); // postResourceTag

                }); // performRequest

       } // if == n/a
    }  catch (exception) {
        console.log("ERROR::", exception) ;
        callback(null, true, exception);
    }
  })
  ();
}


function setTagsOnResouceGroups(billingByResourceGroup, subscription_id, access_token, success)
{
    console.log("SetTagsOnResouceGroups");

    var data = null;
    var header = null
    var url = null;
    var result = "";
    var totalString = "";


    for (var key in billingByResourceGroup)
    {
        resourceBill = billingByResourceGroup[key];
        
        // jump over n/a
        if (resourceBill.resourceGroup == "n/a") continue;

        url = "/subscriptions/" + subscription_id +"/resourceGroups/" + resourceBill.resourceGroup + "?api-version=2014-04-01-preview";
        console.log("URL::", url);

        data = { tags : { billingSpend :  resourceBill.total.toString() } };

        data = JSON.stringify(data);

        console.log("DATA::", data);

        headers = {
                "x-ms-version": "2014-04-01-preview",
                "Authorization":  "Bearer " + access_token,
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": data.length 
                };

         performRequest(
            "management.azure.com",
            usageUrl,
            "POST",
            headers,
            data,
            function(httpResult) {
                result += "SET " + resourceBill.resourceGroup  + " " + httpResult.success;
            } 
        );

    } // for loop

    success(result);
} // getSingleUsage


////////////////////////////
// MAIN BODY - Set Variables
////////////////////////////
console.log("Started");

var resource = "https://management.core.windows.net/";
var client_id = "<<REPLACE-ME>>";
var tenant_id = "<<REPLACE-ME>>";
var grant_type= "client_credentials";
var client_secret = "<<REPLACE-ME>>";
var subscription_id="<<REPLACE-ME>>";

var billing_start_date="2016-10-01";

// Up to the current day
var todayDate = new Date();
var day = '' + todayDate.getDate();
var month = '' + (todayDate.getMonth() + 1);
var year = '' + todayDate.getFullYear();
if (month.length < 2) month = '0' + month;
if (day.length < 2) day = '0' + day;
var billing_end_date= [year, month, day].join('-'); //"2017-10-02";

// https://azure.microsoft.com/en-us/support/legal/offer-details/
var offer="MS-AZR-0026P";
// offer="MS-AZR-0023P";

var currency="USD";
var locale="en-US";
var region="US";
var filter='$filter';


////////////////////////////
// MAIN BODY
////////////////////////////
var data = {
    "resource" : resource,
    "client_id" : client_id,
    "grant_type" : grant_type,
    "client_secret" : client_secret
};

data = querystring.stringify(data);
//console.log("Login Query String: ",data);

headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": data.length 
        };

var url = "/" + tenant_id + "/oauth2/token";
//console.log("url", url);

// https://msdn.microsoft.com/en-us/library/azure/mt219003.aspx
var usageUrl = util.format("/subscriptions/%s/providers/Microsoft.Commerce/UsageAggregates?api-version=2015-06-01-preview&reportedStartTime=%s&reportedEndTime=%s&aggregationGranularity=Daily&showDetails=true", 
    subscription_id, billing_start_date, billing_end_date);

// https://msdn.microsoft.com/en-us/library/azure/mt219004.aspx
var rateCardUrl = "https://management.azure.com/subscriptions/" + subscription_id +
    "/providers/Microsoft.Commerce/RateCard?api-version=2015-06-01-preview&" + filter + 
    "=OfferDurableId%20eq%20'" + offer + "'%20and%20Currency%20eq%20'" + currency + "'%20and%20Locale%20eq%20'" + locale + 
    "'%20and%20RegionInfo%20eq%20'" + region + "'";



// Authorize => Rate Card => Usages Detail(s) => Compute total by resource group
performRequest(
    "login.microsoftonline.com",
    url, 
    "POST",
    headers,
    data,
    function(loginData)
    {
        var authHeader = {
            "x-ms-version": "2015-06-01-preview",
            "Authorization":  "Bearer " + loginData.access_token.toString()
            };

        // download rate card
        performRequest(
            "management.azure.com",
            rateCardUrl,
            "GET",
            authHeader,
            {},
            function(rateCardData) {
                // download usage
                getUsage(
                    usageUrl, 
                    authHeader,
                    function(usageDataList, hasError, err)
                    {
                        // console.log("usageDataList ", usageDataList);
                        caculateResults(usageDataList, rateCardData,
                           function(billingByResourceGroup, grandTotal) {
                                console.log("Billing by Resource Group: ", billingByResourceGroup);
                                console.log("Grand total: ", grandTotal);

                                 console.log("Billing by Resource Group LEN: ", billingByResourceGroup.length);

                               setTagsOnResouceGroupSerial(0, billingByResourceGroup, subscription_id, loginData.access_token.toString(), 
                                function(resultFromTagging, hasErrorRG, errRG)
                                    {
                                        console.log("setTagsOnResouceGroups: ", resultFromTagging);
                                    }
                                );

                            } // function(billingByResourceGroup)
                        ) // calculateResults
                    });
            }  // function(usageData)
        ) // performRequest
    } // success
); // performRequest
