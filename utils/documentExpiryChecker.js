/**
 * Document Expiry Checker Utility
 * 
 * This utility checks document expiry dates and updates status flags for:
 * - Riders: License, RC, Insurance, Medical Certificate, Policy
 * - Restaurants: FSSAI License, GST Registration
 * 
 * Used by cron jobs to alert admins about expiring documents
 */

const Rider = require('../models/Rider');
const Restaurant = require('../models/Restaurant');

// Days before expiry to flag as "expiring" (admin alert threshold)
const EXPIRY_WARNING_DAYS = 30;

/**
 * Check if a date is within warning period or has expired
 * @param {Date} expiryDate - The document expiry date
 * @param {number} warningDays - Days before expiry to flag as warning
 * @returns {object} - { expiring: boolean, expired: boolean }
 */
const checkExpiryStatus = (expiryDate, warningDays = EXPIRY_WARNING_DAYS) => {
  if (!expiryDate) {
    return { expiring: false, expired: false }; // Not set yet
  }

  const today = new Date();
  const expiryMs = new Date(expiryDate).getTime();
  const todayMs = today.getTime();
  const warningMs = warningDays * 24 * 60 * 60 * 1000;

  return {
    expired: todayMs > expiryMs,
    expiring: !false && (expiryMs - todayMs <= warningMs && expiryMs - todayMs > 0)
  };
};

/**
 * UPDATE RIDER DOCUMENT EXPIRY STATUS
 * Checks all rider documents and updates the documentsExpiryStatus flags
 * 
 * @param {string} riderId - ID of the rider
 * @returns {object} - Updated documentsExpiryStatus object
 */
const updateRiderDocumentStatus = async (riderId) => {
  try {
    const rider = await Rider.findById(riderId);
    if (!rider) return null;

    const expiryStatus = {
      licenseExpiring: false,
      licenseExpired: false,
      rcExpiring: false,
      rcExpired: false,
      insuranceExpiring: false,
      insuranceExpired: false,
      medicalExpiring: false,
      medicalExpired: false,
      policyExpiring: false,
      policyExpired: false,
      lastCheckedAt: new Date()
    };

    // Check License expiry
    if (rider.documents?.license?.expiryDate) {
      const licenseStatus = checkExpiryStatus(rider.documents.license.expiryDate);
      expiryStatus.licenseExpiring = licenseStatus.expiring;
      expiryStatus.licenseExpired = licenseStatus.expired;
    }

    // Check RC expiry
    if (rider.documents?.rc?.expiryDate) {
      const rcStatus = checkExpiryStatus(rider.documents.rc.expiryDate);
      expiryStatus.rcExpiring = rcStatus.expiring;
      expiryStatus.rcExpired = rcStatus.expired;
    }

    // Check Insurance expiry
    if (rider.documents?.insurance?.expiryDate) {
      const insuranceStatus = checkExpiryStatus(rider.documents.insurance.expiryDate);
      expiryStatus.insuranceExpiring = insuranceStatus.expiring;
      expiryStatus.insuranceExpired = insuranceStatus.expired;
    }

    // Check Medical Certificate expiry
    if (rider.documents?.medicalCertificate?.expiryDate) {
      const medicalStatus = checkExpiryStatus(rider.documents.medicalCertificate.expiryDate);
      expiryStatus.medicalExpiring = medicalStatus.expiring;
      expiryStatus.medicalExpired = medicalStatus.expired;
    }

    // Check Policy Verification expiry
    if (rider.documents?.policyVerification?.expiryDate) {
      const policyStatus = checkExpiryStatus(rider.documents.policyVerification.expiryDate);
      expiryStatus.policyExpiring = policyStatus.expiring;
      expiryStatus.policyExpired = policyStatus.expired;
    }

    // Update the rider record
    await Rider.updateOne({ _id: riderId }, { documentsExpiryStatus: expiryStatus });

    return expiryStatus;
  } catch (error) {
    console.error(`Error updating rider ${riderId} document status:`, error);
    return null;
  }
};

/**
 * UPDATE RESTAURANT DOCUMENT EXPIRY STATUS
 * Checks all restaurant documents and updates the documentsExpiryStatus flags
 * 
 * @param {string} restaurantId - ID of the restaurant
 * @returns {object} - Updated documentsExpiryStatus object
 */
const updateRestaurantDocumentStatus = async (restaurantId) => {
  try {
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) return null;

    const expiryStatus = {
      licenseExpiring: false,
      licenseExpired: false,
      gstExpiring: false,
      gstExpired: false,
      lastCheckedAt: new Date()
    };

    // Check FSSAI License expiry
    if (restaurant.documents?.license?.expiry) {
      const licenseStatus = checkExpiryStatus(restaurant.documents.license.expiry);
      expiryStatus.licenseExpiring = licenseStatus.expiring;
      expiryStatus.licenseExpired = licenseStatus.expired;
    }

    // Check GST expiry
    if (restaurant.documents?.gst?.expiryDate) {
      const gstStatus = checkExpiryStatus(restaurant.documents.gst.expiryDate);
      expiryStatus.gstExpiring = gstStatus.expiring;
      expiryStatus.gstExpired = gstStatus.expired;
    }

    // Update the restaurant record
    await Restaurant.updateOne({ _id: restaurantId }, { documentsExpiryStatus: expiryStatus });

    return expiryStatus;
  } catch (error) {
    console.error(`Error updating restaurant ${restaurantId} document status:`, error);
    return null;
  }
};

/**
 * CHECK ALL RIDERS WITH EXPIRING DOCUMENTS
 * Used for admin dashboard alerts
 * 
 * @returns {array} - Array of riders with expiring/expired documents
 */
const getRidersWithExpiringDocs = async () => {
  try {
    return await Rider.find({
      $or: [
        { 'documentsExpiryStatus.licenseExpiring': true },
        { 'documentsExpiryStatus.licenseExpired': true },
        { 'documentsExpiryStatus.rcExpiring': true },
        { 'documentsExpiryStatus.rcExpired': true },
        { 'documentsExpiryStatus.insuranceExpiring': true },
        { 'documentsExpiryStatus.insuranceExpired': true },
        { 'documentsExpiryStatus.medicalExpiring': true },
        { 'documentsExpiryStatus.medicalExpired': true },
        { 'documentsExpiryStatus.policyExpiring': true },
        { 'documentsExpiryStatus.policyExpired': true }
      ]
    }).select('_id user documents.license.expiryDate documents.rc.expiryDate documentsExpiryStatus');
  } catch (error) {
    console.error('Error fetching riders with expiring docs:', error);
    return [];
  }
};

/**
 * CHECK ALL RESTAURANTS WITH EXPIRING DOCUMENTS
 * Used for admin dashboard alerts
 * 
 * @returns {array} - Array of restaurants with expiring/expired documents
 */
const getRestaurantsWithExpiringDocs = async () => {
  try {
    return await Restaurant.find({
      $or: [
        { 'documentsExpiryStatus.licenseExpiring': true },
        { 'documentsExpiryStatus.licenseExpired': true },
        { 'documentsExpiryStatus.gstExpiring': true },
        { 'documentsExpiryStatus.gstExpired': true }
      ]
    }).select('_id name documents.license.expiry documents.gst.expiryDate documentsExpiryStatus');
  } catch (error) {
    console.error('Error fetching restaurants with expiring docs:', error);
    return [];
  }
};

/**
 * REFRESH ALL RIDERS DOCUMENT STATUS
 * Run periodically (daily) via cron job
 * 
 * @returns {object} - { updated: number, failed: number }
 */
const refreshAllRidersDocumentStatus = async () => {
  try {
    const allRiders = await Rider.find().select('_id');
    let updated = 0;
    let failed = 0;

    for (const rider of allRiders) {
      const result = await updateRiderDocumentStatus(rider._id);
      if (result) {
        updated++;
      } else {
        failed++;
      }
    }

    console.log(`Document expiry check - Riders: ${updated} updated, ${failed} failed`);
    return { updated, failed };
  } catch (error) {
    console.error('Error refreshing all riders document status:', error);
    return { updated: 0, failed: -1 };
  }
};

/**
 * REFRESH ALL RESTAURANTS DOCUMENT STATUS
 * Run periodically (daily) via cron job
 * 
 * @returns {object} - { updated: number, failed: number }
 */
const refreshAllRestaurantsDocumentStatus = async () => {
  try {
    const allRestaurants = await Restaurant.find().select('_id');
    let updated = 0;
    let failed = 0;

    for (const restaurant of allRestaurants) {
      const result = await updateRestaurantDocumentStatus(restaurant._id);
      if (result) {
        updated++;
      } else {
        failed++;
      }
    }

    console.log(`Document expiry check - Restaurants: ${updated} updated, ${failed} failed`);
    return { updated, failed };
  } catch (error) {
    console.error('Error refreshing all restaurants document status:', error);
    return { updated: 0, failed: -1 };
  }
};

module.exports = {
  checkExpiryStatus,
  updateRiderDocumentStatus,
  updateRestaurantDocumentStatus,
  getRidersWithExpiringDocs,
  getRestaurantsWithExpiringDocs,
  refreshAllRidersDocumentStatus,
  refreshAllRestaurantsDocumentStatus,
  EXPIRY_WARNING_DAYS
};
