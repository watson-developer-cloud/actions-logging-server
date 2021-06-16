const Cloudant = require('@cloudant/cloudant');
const vcap = require('../config/vcap-local.json');
const params = require("../config/params")

let db;

function dbCloudantConnect() {
    return new Promise((resolve, reject) => {
        Cloudant({
            url: vcap.services.cloudantNoSQLDB.credentials.url
        }, ((err, cloudant) => {
            if (err) {
                console.log('Connect failure: ' + err.message + ' for Cloudant DB: ' + params.db_name);
                reject(err);
            } else {
                let db = cloudant.use(params.db_name);
                console.log('Connect success! Connected to DB: ' + params.db_name);
                resolve(db);
            }
        }));
    });
}

// Initialize the DB when this module is loaded
(function getDbConnection() {
    console.log('Initializing Cloudant connection...');
    dbCloudantConnect().then((database) => {
        console.log('Cloudant connection initialized.');
        db = database;
        exports.db = db
    }).catch((err) => {
        console.log('Error while initializing DB: ' + err.message);
        throw err;
    });
})();