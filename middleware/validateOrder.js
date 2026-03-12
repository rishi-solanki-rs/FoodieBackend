const { body, validationResult } = require('express-validator');
const { sendError } = require('../utils/responseFormatter');
const { isValidObjectId } = require('mongoose');
const validatePlaceOrder = [
    body('addressId')
        .notEmpty().withMessage('addressId is required')
        .custom(val => isValidObjectId(val)).withMessage('Invalid addressId'),
    body('paymentMethod')
        .notEmpty().withMessage('paymentMethod is required')
        .isIn(['wallet', 'online']).withMessage('Invalid paymentMethod. Must be wallet or online'),
    body('paymentId')
        .optional()
        .isString().withMessage('paymentId must be a string'),
];
const validateOrderStatus = [
    body('status')
        .notEmpty().withMessage('status is required')
        .isIn(['accepted', 'preparing', 'ready', 'assigned', 'picked_up', 'delivery_arrived', 'delivered', 'cancelled'])
        .withMessage('Invalid status'),
];
const validateCancelOrder = [
    body('reason')
        .optional()
        .isString().withMessage('reason must be a string')
        .isLength({ max: 500 }).withMessage('reason must not exceed 500 characters'),
];
const validateRateOrder = [
    body('restaurantRating')
        .optional()
        .isInt({ min: 1, max: 5 }).withMessage('restaurantRating must be between 1 and 5'),
    body('riderRating')
        .optional()
        .isInt({ min: 1, max: 5 }).withMessage('riderRating must be between 1 and 5'),
    body('comment')
        .optional()
        .isString().withMessage('comment must be a string')
        .isLength({ max: 1000 }).withMessage('comment must not exceed 1000 characters'),
    body('photos')
        .optional()
        .isArray().withMessage('photos must be an array'),
    body().custom((value, { req }) => {
        if (req.body.restaurantRating === undefined && req.body.riderRating === undefined) {
            throw new Error('At least one rating is required');
        }
        return true;
    }),
];
const validateRateRider = [
    body('rating')
        .notEmpty().withMessage('rating is required')
        .isInt({ min: 1, max: 5 }).withMessage('rating must be between 1 and 5'),
    body('review')
        .optional()
        .isString().withMessage('review must be a string')
        .isLength({ max: 1000 }).withMessage('review must not exceed 1000 characters'),
    body('feedback')
        .optional()
        .isArray().withMessage('feedback must be an array')
        .custom(val => {
            if (Array.isArray(val)) {
                return val.every(item => typeof item === 'string');
            }
            return true;
        }).withMessage('feedback array must contain only strings'),
];
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const formattedErrors = errors.array().map(err => ({
            field: err.param,
            message: err.msg,
        }));
        return sendError(res, 400, 'Validation failed', formattedErrors);
    }
    next();
};
module.exports = {
    validatePlaceOrder,
    validateOrderStatus,
    validateCancelOrder,
    validateRateOrder,
    validateRateRider,
    handleValidationErrors,
};
