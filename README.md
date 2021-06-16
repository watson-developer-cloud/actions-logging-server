
# Actions Logging Server

  

This Actions logging server is the backend for the Actions Analytics Dashboard. This server serves two functions. It serves as an endpoint for your **Watson Assistant** webhook with the new **Actions** skill and will store relevant information received from your webhook in your Cloudant database. This server also queries the database to provides relevant analytics to the frontend of your dashboard.

  

## Setup

  

For this tutorial, we will be hosting this server on IBMCloud's CloudFoundry so to get started, login to your IBMCloud account (or signup if you do not have one yet) and head to the console.

  

Next, search for *Node.js Express App* to create a sample Node.js application. Once created, select *Deploy your app* under *Deployment automation*. Create a new IBM Cloud API key and for the *Deployment target*, select **Cloud Foundry**. At the bottom, you will then be able to select a url for your server; make sure to save this somewhere for later. Next wait for the app to deploy (this may take a while), and tap the *Source* url on the left under *Details*. Clone the git repository this urls brings you to (You will have to add an SSH key to your account to clone via SSH or create a Personal access token to clone via HTTPS). This is the repository where your server's code will be stored. In your local repository, delete all the pre-made code you cloned **except for cli-config.yml and mainifest.yml**. Next, download all the code from this repository and place it in that folder for your server repository.

  

Once you have all the code for the server locally, you will have to provide the credentials to access your Cloudant database. To do this, simply find the *server/config/vcap-local.json* file in your server and paste the credentials you had saved when creating your cloudant database where it says <PASTE_CLOUDANT_CREDENTIALS_HERE>.

  

Next, you will need a secret for your webhook. To do this, just generate any 256-bit string. One way to do this would be to use an online tool such as https://www.allkeysgenerator.com/Random/Security-Encryption-Key-Generator.aspx and select 256-bit at the top. Copy that string into *server/config/params.js* where it says <PASTE_SECRET_HERE>. This will be the secret used when setting up your webhook later.

  

Now that all the setup is done. You just have to git commit and push your code using the following commands which will trigger the *ci-pipeline* on IBMCloud to run and to deploy your updated app.

> git add .

> git commit -m "Initial server commit"

> git push origin master

Now, once your ci-pipeline finishes running, your server setup should be complete!