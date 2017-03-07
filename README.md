# Azure-Billing
This Node.js script gets the Azure billing information for a subscription, sum it per resource group and places it as a tag on each resource group.

Usage:

1 - Install node.js

2 - Create a service principle

3 - Set the billing start date (you can make this auto calculate).  The end date will be computed to the current date.

4 - Set you Azure subscription pricing: https://azure.microsoft.com/en-us/support/legal/offer-details/ in the “offer” variable
Run the script

Optionally - set some policies around the data (Note: this script is not a foolproof way to cap Azure spending)

5 - Optional: Create a new tag in each resource group (e.g. maxSpend = 10000)

6 - Optional: Create a policy that compares billingSpend to maxSpend and throw an error if it is too high when new resources are attempted to be created.


