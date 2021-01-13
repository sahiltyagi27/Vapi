'use strict';

const Promise = require('bluebird');
const MongoClient = require('mongodb').MongoClient;

let db;
let dbRegional;

/**
 * Get MongoDB client object
 * @returns {Promise<any>|Promise<db>}
 */
exports.getMongodbCollection = name => {
    if (db) {
        return Promise.resolve(db.collection(name));
    } else {
        return MongoClient
            .connect(process.env.MONGODB_URL, {
                promiseLibrary: Promise
            })
            .then(client => {
                db = client.db(process.env.MONGODB_DB);
                return db.collection(name);
            });
    }
};

exports.getMongodbCollectionRegional = name => {
    if (dbRegional) {
        return Promise.resolve(dbRegional.collection(name));
    } else {
        return MongoClient
            .connect(process.env.MONGODB_URL_REGIONAL, {
                promiseLibrary: Promise
            })
            .then(client => {
                dbRegional = client.db(process.env.MONGODB_DB_REGIONAL);
                return dbRegional.collection(name);
            });
    }
};