'use strict';

const Promise = require('bluebird');
const validator = require('validator');
const errors = require('../errors');
const { MongoError } = require('mongodb');
const weekdaysHash = require('./weekdaysHash');
const crypto = require('crypto');
const uuid = require('uuid');
const { merchantApiErrorCodes } = require('../errors/api-error-codes');
const SessionId = uuid.v4();
var winston = require('winston');
require('winston-loggly-bulk');



exports.logInfo = (message) => {
    console.log(message);
    var logMessage = Object.assign({}, message);
    logMessage.functionName = 'VoucherApi';

    winston.configure({
        transports: [
            new winston.transports.Loggly({
                token: process.env.LOGGLY_TOKEN,
                subdomain: 'vourity',
                tags: ['Winston-NodeJS'],
                json: true
            })
        ]
    });

    winston.info(logMessage);
};

exports.logEvents = (message) => {
    var error = Object.assign({}, message);
    error.functionName = 'OrderService';
    winston.configure({
        transports: [
            new winston.transports.Loggly({
                token: process.env.LOGGLY_TOKEN,
                subdomain: 'vourity',
                tags: ['Winston-NodeJS'],
                json: true
            })
        ]
    });

    winston.log('error', error);
};

exports.CustomLogs = (message,context) => {
    var logMessage = {};
    if (!context)
        context = { executionContext: {}};
    let methodName;
    if (context.executionContext)
        methodName = context.executionContext.functionName ? context.executionContext.functionName : null;
    logMessage.methodName = methodName;
    logMessage.logMessage = message;
    logMessage.functionName = 'OrderService';
    logMessage.env = process.env.ENV;
    logMessage.type = 'Custom';
   
    winston.configure({
        transports: [
            new winston.transports.Loggly({
                token: process.env.LOGGLY_TOKEN,
                subdomain: 'vourity',
                tags: ['Winston-NodeJS'],
                json: true
            })
        ]
    });

    winston.info(logMessage);
};
exports.handleError = (context, error) => {
    context.log.error('voucherApi error = ' + error);
    switch (error.constructor) {
        case errors.TransactionError:
        case errors.MissingMerchantIDError:
        case errors.MissingBalanceAccountIDError:
        case errors.IncorrectMerchantIDError:
        case errors.RedemptionCostError:
        case errors.MerchantIDNotLinked:
        case errors.DuplicateVoucherError:
        case errors.EmptyRequestBodyError:
        case errors.InvalidUUIDError:
        case errors.MissingPassTokenError:
        case errors.MissingVoucherTokenError:
        case errors.VoucherNotFoundError:
        case errors.VoucherLinkNotFoundError:
        case errors.VouchersApiServerError:
        case errors.VoucherRedeemdedError:
        case errors.VoucherLockedError:
        case errors.VoucherExpiredError:
        case errors.VoucherValidWeekdaysError:
        case errors.VoucherValidTimeError:
        case errors.IncorrectVoucherPinCodeError:
        case errors.MissingRedemptionCodeError:
        case errors.IncorrectRedemptionCodeError:
        case errors.MissingSalesPersonCodeError:
        case errors.MissingFixedAmountError:
        case errors.MissingCurrencyError:
        case errors.IncorrectSettleValueOnRedemptionError:
        case errors.VoucherCurrencyMismatchError:
        case errors.RedemptionFixedAmountExceededError:
        case errors.MissingRedemptionsCountError:
        case errors.NoRedemptionsLeftError:
        case errors.BalanceAccountNotFoundError:
            this.setContextResError(context, error);
            break;
        case MongoError:
            this.handleMongoErrors(context, error);
            break;
        default:
            this.handleDefaultError(context, error);
            break;
    }
};

exports.hashToken = token => crypto.createHash('sha512')
    .update(`${token}`)
    .digest('hex');

exports.validateUUIDField = (context, id, message = 'The voucher id specified in the URL does not match the UUID v4 format.') => {
    return new Promise((resolve, reject) => {
        if (validator.isUUID(id, 4)) {
            resolve();
        } else {
            reject(
                new errors.InvalidUUIDError(message, 400)
            );
        }
    });
};

exports.setContextResError = (context, error) => {
    context.res = {
        status: error.code,
        body: {
            code: error.code,
            description: error.message,
            reasonPhrase: error.name
        }
    };
};

exports.handleDefaultError = (context, error) => {
    const response = error.error;
    if (response && response.reasonPhrase) {
        if (merchantApiErrorCodes.includes(response.reasonPhrase)) {
            const errorFormatted = new errors.MerchantApiError(
                response.reasonPhrase,
                response.description,
                response.code
            );

            this.setContextResError(
                context,
                errorFormatted
            );
            context.log.error(error.message || error);
            context.log.error(error);
        } else {
            this.setContextResError(
                context,
                new errors.VouchersApiServerError(
                    'Something went wrong. Please try again later.',
                    500
                )
            );
        }
    } else {
        this.setContextResError(
            context,
            new errors.VouchersApiServerError(
                'Something went wrong. Please try again later.',
                500
            )
        );
    }
};

exports.handleMongoErrors = (context, error) => {
    switch (error.code) {
        case 11000:
            handleDuplicateDocumentInserts(context);
            break;
        default:
            this.handleDefaultError(context, error);
            break;
    }
};

const handleDuplicateDocumentInserts = context => {
    let className, entity;

    if (context.req.body.docType === 'vouchers') {
        className = 'DuplicateVoucherError';
        entity = 'vouchers';
    } else if (context.req.body.docType === 'balanceAccount') {
        className = 'DuplicateBalanceAccountError';
        entity = 'balanceAccount';
    } else if (context.req.body.docType === 'balanceAccountTransactions') {
        className = 'DuplicateBalanceAccountTransactions';
        entity = 'balanceAccountTransactions';
    } else if (context.req.body.docType === 'partnerNetworks') {
        className = 'DuplicatePartnerNetworkss';
        entity = 'partnerNetworks';
    }

    this.setContextResError(
        context,
        new errors[className](
            `You've requested to create a new ${entity} but a ${entity} with the specified _id field already exists.`,
            409
        )
    );
};

exports.expandWeekdayCodes = weekdaysString => {
    return weekdaysString
        .split(',')
        .map(code => weekdaysHash[code])
        .join(', ');
};

exports.hashToken = token => crypto.createHash('sha512')
    .update(`${token}`)
    .digest('hex');

exports.formatDateFields = voucher => {
    if (voucher['orderDate']) {
        voucher['orderDate'] = new Date(voucher['orderDate']);
    }

    if (voucher.validPeriod) {
        if (voucher.validPeriod.validFromDate) {
            voucher.validPeriod.validFromDate = new Date(voucher.validPeriod.validFromDate);
        }

        if (voucher.validPeriod.validToDate) {
            voucher.validPeriod.validToDate = new Date(voucher.validPeriod.validToDate);
        }
    }

    if (voucher.validFromDate) {
        voucher.validFromDate = new Date(voucher.validFromDate);
    }

    if (voucher.validToDate) {
        voucher.validToDate = new Date(voucher.validToDate);
    }


    return voucher;
};

exports.formatWalletDateFields = wallet => {
    if (wallet.walletAmountExpiryDate) {
        wallet.walletAmountExpiryDate = new Date(wallet.walletAmountExpiryDate);
    }

    if (wallet.validFromDate) {
        wallet.validFromDate = new Date(wallet.validFromDate);
    }

    if (wallet.validToDate) {
        wallet.validToDate = new Date(wallet.validToDate);
    }

    if (wallet.walletHolder && wallet.walletHolder.lastLoginDate) {
        wallet.walletHolder.lastLoginDate = new Date(wallet.walletHolder.lastLoginDate);
    }

    if (wallet.walletHolder && wallet.walletHolder.lastFailedLoginDate) {
        wallet.walletHolder.lastFailedLoginDate = new Date(wallet.walletHolder.lastFailedLoginDate);
    }

    return wallet;
};

exports.voucherLog = (voucher, merchant, err) => {
    const voucherLogMessage = {};
    voucherLogMessage._id = uuid.v4();
    voucherLogMessage.docType = 'voucherLog';
    voucherLogMessage.partitionKey = voucher._id;
    voucherLogMessage.voucherID = voucher._id;
    voucherLogMessage.voucherName = voucher.voucherTitle;
    voucherLogMessage.actionText = 'Redemption failed';
    voucherLogMessage.actionCode = 'redemptionfailed';
    if (merchant) {
        voucherLogMessage.merchantName = merchant.merchantName;
        voucherLogMessage.merchantID = merchant._id;
    }
    voucherLogMessage.result = err.message;
    voucherLogMessage.statusText = err.name;
    voucherLogMessage.statusCode = err.code;
    voucherLogMessage.createdDate = new Date();
    voucherLogMessage.updatedDate = new Date();
    if (!voucherLogMessage.merchantID && !voucherLogMessage.merchantName) {
        voucherLogMessage.merchantID = voucher.issuer.merchantID;
        voucherLogMessage.merchantName = voucher.issuer.merchantName;
    }
    return voucherLogMessage;
};

exports.updateVoucher = (from, to, reduced, increased, voucherCollections) => {

    if (from) {
        var updateQuery1 = voucherCollections.updateOne({
            _id: from._id,
            docType: 'balanceAccount',
            partitionKey: from._id
        }, {
            $set: {
                balanceAmount: reduced
            }
        });
    }

    if (to) {
        var updateQuery2 = voucherCollections.updateOne({
            _id: to._id,
            docType: 'balanceAccount',
            partitionKey: to._id
        }, {
            $set: {
                balanceAmount: increased
            }
        });
    }
    const requestUpdate = new Array();
    requestUpdate.push(updateQuery1, updateQuery2);
    return Promise.all(requestUpdate);

};

exports.updateTransactionDoc = (balanceAccountTransaction, status, voucherCollections, fromBalanceAccountIntialAmount = null,toBalanceAccountIntialAmount = null) => {

    const updateQuery1 = voucherCollections.updateOne({
        _id: balanceAccountTransaction._id,
        docType: 'balanceAccountTransactions',
        partitionKey: balanceAccountTransaction._id
    }, {
        $set: {
            fromBalanceAccountIntialAmount: fromBalanceAccountIntialAmount,
            toBalanceAccountIntialAmount: toBalanceAccountIntialAmount,
            transactionStatus: status
        }
    });

    return Promise.resolve(updateQuery1);

};
