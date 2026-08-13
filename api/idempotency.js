const PENDING_RECEIPT_LEASE_MS = 30 * 1000;

const decideReceipt = (receipt, method, path, now = Date.now()) => {
    if (!receipt) {
        return { type: 'claim' };
    }
    if (receipt.method !== method || receipt.path !== path) {
        return { type: 'conflict' };
    }
    if (receipt.state === 'confirmed') {
        return {
            type: 'replay',
            statusCode: receipt.statusCode,
            responseBody: receipt.responseBody
        };
    }
    const updatedAt = new Date(receipt.updatedAt || receipt.createdAt || 0).getTime();
    if (now - updatedAt < PENDING_RECEIPT_LEASE_MS) {
        return { type: 'pending' };
    }
    return { type: 'reclaim' };
};

module.exports = {
    PENDING_RECEIPT_LEASE_MS,
    decideReceipt
};
