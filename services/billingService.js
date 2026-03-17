/**
 * billingService.js
 * -----------------
 * Generates CustomerBill, RestaurantBill, and RiderBill for a delivered order.
 *
 * Rules:
 *  - Called by paymentService after a successful settlement transaction.
 *  - Fully idempotent: if CustomerBill already exists for the order, returns early.
 *  - CGST = SGST = total GST / 2  (intrastate Indian GST)
 *  - GST rates for platform fee, delivery, and commission come from AdminSetting.
 */

'use strict';

const mongoose    = require('mongoose');
const PDFDocument = require('pdfkit');
const Order       = require('../models/Order');
const AdminSetting = require('../models/AdminSetting');
const CustomerBill = require('../models/CustomerBill');
const RestaurantBill = require('../models/RestaurantBill');
const RiderBill   = require('../models/RiderBill');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const r2 = (n) => {
  const numeric = Number(n);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(5));
};

const nearlyEqual = (a, b, tolerance = 0.00005) => Math.abs(r2(a) - r2(b)) <= tolerance;

const toObjectIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  return String(value);
};

const splitHalf = (value) => {
  const total = r2(value);
  const cgst = r2(total / 2);
  const sgst = r2(total - cgst);
  return { total, cgst, sgst };
};

const formatAmount = (value) => {
  const rounded = r2(value);
  const two = Number(rounded.toFixed(2));
  if (nearlyEqual(rounded, two, 0.00001)) return two.toFixed(2);
  return rounded.toFixed(5).replace(/\.?0+$/, '');
};

const formatCurrency = (value) => `₹${formatAmount(value)}`;

const normalizeItemName = (item) => {
  if (typeof item?.name === 'string') return item.name;
  return item?.name?.en || item?.name?.de || item?.name?.ar || 'Item';
};

/**
 * Build a GST breakdown object.
 * @param {number} base      Amount on which GST is applied
 * @param {number} percent   GST rate (e.g. 18)
 */
function makeGstBlock(base, percent) {
  const total = r2(base * (percent / 100));
  const half  = r2(total / 2);
  return {
    percent,
    base:  r2(base),
    total,
    cgst: half,
    sgst: half,
  };
}

/** Load admin settings once and cache within a single call to generateBills. */
async function loadGstRates() {
  const s = await AdminSetting.findOne().lean();
  return {
    platformFeeGstPercent:      s?.platformFeeGstPercent      ?? 18,
    deliveryChargeGstPercent:   s?.deliveryChargeGstPercent   ?? 18,
    adminCommissionGstPercent:  s?.adminCommissionGstPercent  ?? 18,
  };
}

function buildBillingDataFromOrder(orderLike) {
  const order = orderLike || {};
  const pb = order.paymentBreakdown || {};
  const rider = order.riderEarnings || {};

  const items = Array.isArray(order.items)
    ? order.items.map((item) => ({
        name: normalizeItemName(item),
        qty: Number(item?.quantity || 0),
        rate: r2(item?.price ?? 0),
        total: r2(item?.lineTotal ?? ((Number(item?.price || 0)) * (Number(item?.quantity || 0)))),
      }))
    : [];

  const itemsTotal = r2(pb.itemTotal ?? order.itemTotal ?? items.reduce((sum, item) => sum + item.total, 0));
  const restaurantDiscount = r2(pb.restaurantDiscount ?? 0);
  const taxableFood = r2(pb.priceAfterRestaurantDiscount ?? pb.taxableAmountFood ?? Math.max(0, itemsTotal - restaurantDiscount));
  const foodGst = r2(pb.gstOnFood ?? 0);
  const foodSplit = {
    total: foodGst,
    cgst: r2(pb.cgstOnFood ?? (foodGst / 2)),
    sgst: r2(pb.sgstOnFood ?? (foodGst - (pb.cgstOnFood ?? (foodGst / 2)))),
    percent: r2(pb.gstPercentOnFood ?? (taxableFood > 0 ? (foodGst / taxableFood) * 100 : 0)),
  };

  const packagingCharge = r2(pb.packagingCharge ?? order.packaging ?? 0);
  const packagingGst = r2(pb.packagingGST ?? 0);
  const packagingSplit = {
    total: packagingGst,
    cgst: r2(pb.cgstOnPackaging ?? (packagingGst / 2)),
    sgst: r2(pb.sgstOnPackaging ?? (packagingGst - (pb.cgstOnPackaging ?? (packagingGst / 2)))),
    percent: r2(pb.gstPercentOnPackaging ?? (packagingCharge > 0 ? (packagingGst / packagingCharge) * 100 : 0)),
  };

  const couponCode = order.couponCode || null;
  const couponType = order.couponType || pb.couponType || null;
  const couponDiscount = r2(pb.couponDiscountAmount ?? pb.foodierDiscount ?? order.discount ?? 0);

  const deliveryOriginalCharge = r2(pb.deliveryFee ?? pb.deliveryCharge ?? order.deliveryFee ?? 0);
  const deliveryDiscountApplied = r2(pb.deliveryDiscountUsed ?? 0);
  const deliveryFinalCharge = r2(pb.deliveryFeeAfterDiscount ?? Math.max(0, deliveryOriginalCharge - deliveryDiscountApplied));
  const deliveryGst = r2(pb.deliveryGST ?? 0);
  const deliverySplit = {
    total: deliveryGst,
    cgst: r2(pb.cgstDelivery ?? (deliveryGst / 2)),
    sgst: r2(pb.sgstDelivery ?? (deliveryGst - (pb.cgstDelivery ?? (deliveryGst / 2)))),
    percent: r2(pb.deliveryChargeGstPercent ?? 0),
  };

  const platformOriginalAmount = r2(pb.platformFee ?? order.platformFee ?? 0);
  const platformDiscountApplied = r2(pb.platformDiscountSplit ?? Math.max(0, (pb.platformDiscountUsed ?? 0) - deliveryDiscountApplied));
  const platformFinalAmount = r2(pb.platformFeeAfterDiscount ?? Math.max(0, platformOriginalAmount - platformDiscountApplied));
  const platformGst = r2(pb.platformGST ?? 0);
  const platformSplit = {
    total: platformGst,
    cgst: r2(pb.cgstPlatform ?? (platformGst / 2)),
    sgst: r2(pb.sgstPlatform ?? (platformGst - (pb.cgstPlatform ?? (platformGst / 2)))),
    percent: r2(pb.gstPercentOnPlatform ?? 0),
  };

  const adminDeliverySubsidy = r2(pb.adminDeliverySubsidy ?? deliveryDiscountApplied);
  const smallCartFee = r2(pb.smallCartFee ?? 0);
  const tip = r2(order.tip ?? rider.tip ?? 0);

  const commissionAmount = r2(pb.adminCommissionAmount ?? ((pb.totalAdminCommissionDeduction ?? 0) - (pb.adminCommissionGst ?? 0)));
  const commissionGst = r2(pb.adminCommissionGst ?? 0);
  const commissionSplit = {
    total: commissionGst,
    cgst: r2(pb.cgstAdminCommission ?? (commissionGst / 2)),
    sgst: r2(pb.sgstAdminCommission ?? (commissionGst - (pb.cgstAdminCommission ?? (commissionGst / 2)))),
    percent: r2(pb.adminCommissionGstPercent ?? 0),
  };
  const commissionBase = r2(pb.priceAfterRestaurantDiscount ?? pb.taxableAmountFood ?? Math.max(0, itemsTotal - restaurantDiscount));
  const commissionPercent = r2(commissionBase > 0 ? ((commissionAmount / commissionBase) * 100) : 0);

  const restaurantGross = r2(pb.restaurantGross ?? (taxableFood + packagingCharge));
  const restaurantNetEarning = r2(pb.restaurantNet ?? pb.restaurantNetEarning ?? 0);
  const customerRestaurantBill = r2(pb.customerRestaurantBill ?? pb.finalPayableToRestaurant ?? pb.restaurantBillTotal ?? (taxableFood + foodGst + packagingCharge + packagingGst));

  const riderDeliveryCharge = r2(rider.deliveryCharge ?? 0);
  const riderPlatformFeeShare = r2(rider.platformFee ?? 0);
  const riderIncentive = r2(rider.incentive ?? 0);
  const riderTip = r2(rider.tip ?? order.tip ?? 0);
  const riderIncentivePercent = r2(rider.incentivePercentAtCompletion ?? 0);
  const riderTotalEarning = r2(rider.totalRiderEarning ?? (riderDeliveryCharge + riderPlatformFeeShare + riderIncentive + riderTip));

  const gstSummary = {
    foodGst: foodGst,
    packagingGst,
    deliveryGst,
    platformGst,
    commissionGst,
    cgstTotal: r2(pb.totalGstBreakdownForAdmin?.cgstTotal ?? (foodSplit.cgst + packagingSplit.cgst + deliverySplit.cgst + platformSplit.cgst + commissionSplit.cgst)),
    sgstTotal: r2(pb.totalGstBreakdownForAdmin?.sgstTotal ?? (foodSplit.sgst + packagingSplit.sgst + deliverySplit.sgst + platformSplit.sgst + commissionSplit.sgst)),
    totalGst: r2(pb.totalGstCollected ?? (foodGst + packagingGst + deliveryGst + platformGst + commissionGst)),
  };

  const customerBill = {
    items,
    itemsTotal,
    restaurantDiscount,
    subTotal: taxableFood,
    gstOnFood: foodSplit,
    packaging: {
      charge: packagingCharge,
      gst: packagingGst,
      cgst: packagingSplit.cgst,
      sgst: packagingSplit.sgst,
      total: r2(packagingCharge + packagingGst),
    },
    platformFee: {
      amount: platformOriginalAmount,
      discountApplied: platformDiscountApplied,
      finalAmount: platformFinalAmount,
      gst: platformGst,
      cgst: platformSplit.cgst,
      sgst: platformSplit.sgst,
      total: r2(platformFinalAmount + platformGst),
    },
    delivery: {
      originalCharge: deliveryOriginalCharge,
      discountApplied: deliveryDiscountApplied,
      finalCharge: deliveryFinalCharge,
      gst: deliveryGst,
      cgst: deliverySplit.cgst,
      sgst: deliverySplit.sgst,
      total: r2(deliveryFinalCharge + deliveryGst),
      adminDeliverySubsidy,
    },
    couponDiscount,
    couponCode,
    couponType,
    smallCartFee,
    tip,
    paymentMethod: order.paymentMethod || null,
    paymentStatus: order.paymentStatus || null,
    restaurantBillTotal: customerRestaurantBill,
    finalPayableAmount: r2(order.totalAmount ?? 0),
  };

  const restaurantBill = {
    itemsTotal,
    restaurantDiscount,
    packaging: packagingCharge,
    restaurantGross,
    gst: {
      foodGst,
      foodCgst: foodSplit.cgst,
      foodSgst: foodSplit.sgst,
      packagingGst,
      packagingCgst: packagingSplit.cgst,
      packagingSgst: packagingSplit.sgst,
    },
    commission: {
      commissionPercent,
      commissionAmount,
      commissionGst,
      cgstOnCommission: commissionSplit.cgst,
      sgstOnCommission: commissionSplit.sgst,
    },
    restaurantNetEarning,
  };

  const riderBill = {
    deliveryCharge: riderDeliveryCharge,
    platformFeeShare: riderPlatformFeeShare,
    incentive: riderIncentive,
    tip: riderTip,
    incentivePercent: riderIncentivePercent,
    totalRiderEarning: riderTotalEarning,
  };

  const expectedFinalPayable = r2(customerRestaurantBill + customerBill.platformFee.total + customerBill.delivery.total + smallCartFee + tip);
  const validationIssues = [];

  if (deliveryFinalCharge === 0 && deliveryGst !== 0) {
    validationIssues.push('delivery GST must be zero when final delivery charge is zero');
  }
  if (platformFinalAmount === 0 && platformGst !== 0) {
    validationIssues.push('platform GST must be zero when final platform fee is zero');
  }
  if (couponType === 'free_delivery') {
    if (!nearlyEqual(deliveryFinalCharge, 0)) validationIssues.push('free_delivery coupon should zero customer delivery charge');
    if (!nearlyEqual(deliveryDiscountApplied, deliveryOriginalCharge)) validationIssues.push('free_delivery coupon should discount full original delivery charge');
    if (!nearlyEqual(adminDeliverySubsidy, deliveryOriginalCharge)) validationIssues.push('adminDeliverySubsidy should equal original delivery charge for free_delivery');
  }
  if (!nearlyEqual(gstSummary.totalGst, gstSummary.foodGst + gstSummary.packagingGst + gstSummary.deliveryGst + gstSummary.platformGst + gstSummary.commissionGst)) {
    validationIssues.push('GST summary total mismatch');
  }
  if (!nearlyEqual(riderTotalEarning, riderDeliveryCharge + riderPlatformFeeShare + riderIncentive + riderTip)) {
    validationIssues.push('rider total earning mismatch');
  }
  if (!nearlyEqual(customerBill.finalPayableAmount, expectedFinalPayable)) {
    validationIssues.push('final payable amount mismatch against billing breakdown');
  }

  return {
    orderMeta: {
      orderId: toObjectIdString(order._id),
      status: order.status || null,
      createdAt: order.createdAt || null,
      paymentMethod: order.paymentMethod || null,
      paymentStatus: order.paymentStatus || null,
      couponCode,
      couponType,
      customerId: toObjectIdString(order.customer),
      restaurantId: toObjectIdString(order.restaurant),
      riderId: toObjectIdString(order.rider),
    },
    customerBill,
    restaurantBill,
    riderBill,
    gstSummary,
    validation: {
      isValid: validationIssues.length === 0,
      issues: validationIssues,
    },
  };
}

function validateBillingData(billing) {
  const issues = Array.isArray(billing?.validation?.issues) ? billing.validation.issues : [];
  return {
    isValid: issues.length === 0,
    issues,
  };
}

function ensureSpace(doc, requiredHeight = 24) {
  if (doc.y + requiredHeight > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function drawTable(doc, title, columns, rows) {
  ensureSpace(doc, 40);
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(13).text(title);
  doc.moveDown(0.3);

  const startX = doc.page.margins.left;
  let currentX = startX;
  const headerY = doc.y;

  doc.font('Helvetica-Bold').fontSize(10);
  columns.forEach((column) => {
    doc.text(column.label, currentX, headerY, {
      width: column.width,
      align: column.align || 'left',
    });
    currentX += column.width;
  });

  doc.moveTo(startX, headerY + 14).lineTo(startX + columns.reduce((sum, column) => sum + column.width, 0), headerY + 14).stroke('#CCCCCC');
  doc.y = headerY + 18;
  doc.font('Helvetica').fontSize(9.5);

  rows.forEach((row) => {
    ensureSpace(doc, 18);
    currentX = startX;
    const rowY = doc.y;
    columns.forEach((column, index) => {
      doc.text(String(row[index] ?? ''), currentX, rowY, {
        width: column.width,
        align: column.align || 'left',
      });
      currentX += column.width;
    });
    doc.y = rowY + 16;
  });
}

function drawAmountTable(doc, title, rows) {
  drawTable(
    doc,
    title,
    [
      { label: 'Description', width: 330 },
      { label: 'Amount', width: 160, align: 'right' },
    ],
    rows,
  );
}

function drawSectionHeading(doc, title) {
  ensureSpace(doc, 28);
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#000000').text(title);
}

function drawInfoLine(doc, label, value) {
  ensureSpace(doc, 16);
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).text(label, doc.page.margins.left, y, { continued: true });
  doc.font('Helvetica').text(` ${value ?? ''}`);
}

function createPdfBuffer(docBuilder) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    docBuilder(doc);
    doc.end();
  });
}

async function generateInvoicePdfBuffer(order, billing) {
  return createPdfBuffer((doc) => {
    const customer = order?.customer || {};
    const restaurant = order?.restaurant || {};
    const rider = order?.rider || {};
    const riderUser = rider?.user || {};

    doc.font('Helvetica-Bold').fontSize(18).text('Order Invoice', { align: 'center' });
    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(10);
    doc.text(`Order ID: ${billing.orderMeta.orderId || ''}`);
    doc.text(`Status: ${billing.orderMeta.status || ''}`);
    doc.text(`Created At: ${billing.orderMeta.createdAt ? new Date(billing.orderMeta.createdAt).toISOString() : ''}`);
    doc.text(`Customer: ${customer?.name || customer?.firstName || billing.orderMeta.customerId || ''}`);
    doc.text(`Restaurant: ${restaurant?.name?.en || restaurant?.name || billing.orderMeta.restaurantId || ''}`);
    if (billing.orderMeta.riderId) {
      doc.text(`Rider: ${riderUser?.name || rider?.name || billing.orderMeta.riderId}`);
    }

    drawTable(
      doc,
      'Customer Bill',
      [
        { label: 'Description', width: 220 },
        { label: 'Amount', width: 90, align: 'right' },
        { label: 'GST', width: 90, align: 'right' },
        { label: 'Total', width: 90, align: 'right' },
      ],
      [
        ...billing.customerBill.items.map((item) => [
          `${item.name} x ${item.qty}`,
          formatAmount(item.rate),
          '-',
          formatAmount(item.total),
        ]),
        ['Items Total', formatAmount(billing.customerBill.itemsTotal), '-', formatAmount(billing.customerBill.itemsTotal)],
        ['Restaurant Discount', formatAmount(-billing.customerBill.restaurantDiscount), '-', formatAmount(-billing.customerBill.restaurantDiscount)],
        ['Sub Total', formatAmount(billing.customerBill.subTotal), '-', formatAmount(billing.customerBill.subTotal)],
        ['Food GST', formatAmount(billing.customerBill.gstOnFood.cgst), formatAmount(billing.customerBill.gstOnFood.total), formatAmount(billing.customerBill.gstOnFood.total)],
        ['Packaging', formatAmount(billing.customerBill.packaging.charge), formatAmount(billing.customerBill.packaging.gst), formatAmount(billing.customerBill.packaging.total)],
        ['Platform Fee', formatAmount(billing.customerBill.platformFee.finalAmount), formatAmount(billing.customerBill.platformFee.gst), formatAmount(billing.customerBill.platformFee.total)],
        ['Delivery', formatAmount(billing.customerBill.delivery.finalCharge), formatAmount(billing.customerBill.delivery.gst), formatAmount(billing.customerBill.delivery.total)],
        ['Coupon Discount', formatAmount(-billing.customerBill.couponDiscount), '-', formatAmount(-billing.customerBill.couponDiscount)],
        ['Tip', formatAmount(billing.customerBill.tip), '-', formatAmount(billing.customerBill.tip)],
        ['Small Cart Fee', formatAmount(billing.customerBill.smallCartFee), '-', formatAmount(billing.customerBill.smallCartFee)],
        ['Final Payable Amount', formatAmount(billing.customerBill.finalPayableAmount), '-', formatAmount(billing.customerBill.finalPayableAmount)],
      ],
    );

    drawTable(
      doc,
      'Restaurant Bill',
      [
        { label: 'Description', width: 220 },
        { label: 'Amount', width: 90, align: 'right' },
        { label: 'GST', width: 90, align: 'right' },
        { label: 'Total', width: 90, align: 'right' },
      ],
      [
        ['Items Total', formatAmount(billing.restaurantBill.itemsTotal), '-', formatAmount(billing.restaurantBill.itemsTotal)],
        ['Restaurant Discount', formatAmount(-billing.restaurantBill.restaurantDiscount), '-', formatAmount(-billing.restaurantBill.restaurantDiscount)],
        ['Packaging', formatAmount(billing.restaurantBill.packaging), formatAmount(billing.restaurantBill.gst.packagingGst), formatAmount(billing.restaurantBill.packaging + billing.restaurantBill.gst.packagingGst)],
        ['Restaurant Gross', formatAmount(billing.restaurantBill.restaurantGross), '-', formatAmount(billing.restaurantBill.restaurantGross)],
        ['Food GST', formatAmount(billing.restaurantBill.gst.foodCgst), formatAmount(billing.restaurantBill.gst.foodGst), formatAmount(billing.restaurantBill.gst.foodGst)],
        ['Commission', formatAmount(billing.restaurantBill.commission.commissionAmount), formatAmount(billing.restaurantBill.commission.commissionGst), formatAmount(billing.restaurantBill.commission.commissionAmount + billing.restaurantBill.commission.commissionGst)],
        ['Restaurant Net Earnings', formatAmount(billing.restaurantBill.restaurantNetEarning), '-', formatAmount(billing.restaurantBill.restaurantNetEarning)],
      ],
    );

    drawTable(
      doc,
      'Rider Bill',
      [
        { label: 'Description', width: 220 },
        { label: 'Amount', width: 90, align: 'right' },
        { label: 'GST', width: 90, align: 'right' },
        { label: 'Total', width: 90, align: 'right' },
      ],
      [
        ['Delivery Charge', formatAmount(billing.riderBill.deliveryCharge), '-', formatAmount(billing.riderBill.deliveryCharge)],
        ['Platform Fee Share', formatAmount(billing.riderBill.platformFeeShare), '-', formatAmount(billing.riderBill.platformFeeShare)],
        ['Incentive', formatAmount(billing.riderBill.incentive), '-', formatAmount(billing.riderBill.incentive)],
        ['Tip', formatAmount(billing.riderBill.tip), '-', formatAmount(billing.riderBill.tip)],
        ['Total Rider Earning', formatAmount(billing.riderBill.totalRiderEarning), '-', formatAmount(billing.riderBill.totalRiderEarning)],
      ],
    );

    drawTable(
      doc,
      'GST Summary',
      [
        { label: 'Description', width: 220 },
        { label: 'Amount', width: 90, align: 'right' },
        { label: 'GST', width: 90, align: 'right' },
        { label: 'Total', width: 90, align: 'right' },
      ],
      [
        ['Food GST', '-', formatAmount(billing.gstSummary.foodGst), formatAmount(billing.gstSummary.foodGst)],
        ['Packaging GST', '-', formatAmount(billing.gstSummary.packagingGst), formatAmount(billing.gstSummary.packagingGst)],
        ['Delivery GST', '-', formatAmount(billing.gstSummary.deliveryGst), formatAmount(billing.gstSummary.deliveryGst)],
        ['Platform GST', '-', formatAmount(billing.gstSummary.platformGst), formatAmount(billing.gstSummary.platformGst)],
        ['Commission GST', '-', formatAmount(billing.gstSummary.commissionGst), formatAmount(billing.gstSummary.commissionGst)],
        ['CGST Total', '-', formatAmount(billing.gstSummary.cgstTotal), formatAmount(billing.gstSummary.cgstTotal)],
        ['SGST Total', '-', formatAmount(billing.gstSummary.sgstTotal), formatAmount(billing.gstSummary.sgstTotal)],
        ['Total GST', '-', formatAmount(billing.gstSummary.totalGst), formatAmount(billing.gstSummary.totalGst)],
      ],
    );

    if (!billing.validation.isValid) {
      ensureSpace(doc, 50);
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#B00020').text('Validation Notes');
      doc.fillColor('#000000').font('Helvetica').fontSize(10);
      billing.validation.issues.forEach((issue) => {
        doc.text(`- ${issue}`);
      });
    }
  });
}

async function generateCustomerInvoicePdfBuffer(order, billing) {
  return createPdfBuffer((doc) => {
    const customer = order?.customer || {};
    const restaurant = order?.restaurant || {};
    const customerBill = billing.customerBill;
    const foodInvoiceTotal = r2(customerBill.restaurantBillTotal ?? (customerBill.subTotal + customerBill.gstOnFood.total + customerBill.packaging.charge + customerBill.packaging.gst));
    const componentsChargeTotal = r2(customerBill.platformFee.finalAmount + customerBill.platformFee.gst + customerBill.delivery.finalCharge + customerBill.delivery.gst + customerBill.tip + customerBill.smallCartFee);
    const chargeInvoiceTotal = r2(customerBill.finalPayableAmount - foodInvoiceTotal);
    const combinedInvoiceTotal = r2(foodInvoiceTotal + chargeInvoiceTotal);
    const chargeRoundOffAdjustment = r2(chargeInvoiceTotal - componentsChargeTotal);

    const toWords = (num) => {
      const n = Math.floor(Math.max(0, Number(num) || 0));
      const paise = Math.round((Math.max(0, Number(num) || 0) - n) * 100);
      const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
      const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

      const twoDigits = (value) => {
        if (value < 20) return ones[value];
        return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ''}`.trim();
      };

      const threeDigits = (value) => {
        const hundred = Math.floor(value / 100);
        const rest = value % 100;
        if (!hundred) return twoDigits(rest);
        return `${ones[hundred]} Hundred${rest ? ` ${twoDigits(rest)}` : ''}`.trim();
      };

      let value = n;
      const parts = [];
      const crore = Math.floor(value / 10000000);
      if (crore) {
        parts.push(`${threeDigits(crore)} Crore`);
        value %= 10000000;
      }
      const lakh = Math.floor(value / 100000);
      if (lakh) {
        parts.push(`${threeDigits(lakh)} Lakh`);
        value %= 100000;
      }
      const thousand = Math.floor(value / 1000);
      if (thousand) {
        parts.push(`${threeDigits(thousand)} Thousand`);
        value %= 1000;
      }
      if (value) {
        parts.push(threeDigits(value));
      }
      const rupeesWords = parts.join(' ').trim() || 'Zero';
      const paiseWords = paise > 0 ? ` and ${twoDigits(paise)} Paise` : '';
      return `${rupeesWords} Rupees${paiseWords} only`;
    };

    const drawInvoiceFrame = ({ invoiceNo, orderDisplayId, pageDate, rows, totals, totalAmount, issuedByLabel, columns }) => {
      const left = doc.page.margins.left;
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      let y = doc.page.margins.top;

      doc.rect(left, y, width, 36).stroke('#444444');
      doc.font('Helvetica-Bold').fontSize(16).text('Tax Invoice', left, y + 9, { width, align: 'center' });
      y += 42;

      const leftW = 230;
      const rightW = width - leftW;
      const headerH = 160;
      const rightTopH = 70;

      doc.rect(left, y, leftW, headerH).stroke('#444444');
      doc.rect(left + leftW, y, rightW, headerH).stroke('#444444');

      const customerName = customer?.name || customer?.firstName || '';
      const customerAddress = order?.deliveryAddress?.addressLine
        || order?.deliveryAddress?.address
        || [order?.customer?.address?.street, order?.customer?.address?.city].filter(Boolean).join(', ')
        || '';

      doc.font('Helvetica').fontSize(9).text('Invoice To', left + 6, y + 8);
      doc.font('Helvetica-Bold').fontSize(10.5).text(customerName, left + 6, y + 22, { width: leftW - 12, lineBreak: false });
      doc.font('Helvetica').fontSize(9).text(customerAddress || 'Address not available', left + 6, y + 38, { width: leftW - 12 });

      doc.moveTo(left, y + 82).lineTo(left + leftW, y + 82).stroke('#444444');
      doc.font('Helvetica').fontSize(8.5).text(issuedByLabel, left + 6, y + 88, { width: leftW - 12 });
      doc.font('Helvetica-Bold').fontSize(10.5).text(restaurant?.name?.en || restaurant?.name || '', left + 6, y + 104, { width: leftW - 12 });
      doc.font('Helvetica').fontSize(9.5).text(`GSTIN: ${restaurant?.taxConfig?.gstNumber || 'NA'}`, left + 6, y + 122, { width: leftW - 12 });

      doc.moveTo(left + leftW, y + rightTopH).lineTo(left + width, y + rightTopH).stroke('#444444');
      const x1 = left + leftW + Math.round(rightW * 0.33);
      const x2 = x1 + Math.round(rightW * 0.44);
      doc.moveTo(x1, y).lineTo(x1, y + rightTopH).stroke('#444444');
      doc.moveTo(x2, y).lineTo(x2, y + rightTopH).stroke('#444444');

      const colInvW = x1 - (left + leftW) - 12;
      const colOrdW = x2 - x1 - 12;
      const colDateW = (left + width) - x2 - 12;

      doc.font('Helvetica-Bold').fontSize(8).text('Invoice No', left + leftW + 6, y + 7);
      doc.font('Helvetica').fontSize(9.5).text(invoiceNo, left + leftW + 6, y + 20, { width: colInvW });
      doc.font('Helvetica-Bold').fontSize(8).text('Order Id:', x1 + 6, y + 7);
      doc.font('Helvetica').fontSize(8.5).text(String(orderDisplayId || ''), x1 + 6, y + 20, { width: colOrdW, lineBreak: true });
      doc.font('Helvetica-Bold').fontSize(8).text('Date', x2 + 6, y + 7);
      doc.font('Helvetica').fontSize(9.5).text(pageDate, x2 + 6, y + 20, { width: colDateW });

      y += headerH;

      const tableHeaderH = 34;
      const tableColsInput = Array.isArray(columns) && columns.length > 0
        ? columns.map((c) => ({ ...c }))
        : [
            { key: 'sno', label: 'S.No.', w: 44, align: 'center' },
            { key: 'name', label: 'Description', w: 180, align: 'left' },
            { key: 'amount', label: 'Amount', w: 78, align: 'right' },
            { key: 'discount', label: 'Discount', w: 78, align: 'right' },
            { key: 'taxable', label: 'Taxable', w: 78, align: 'right' },
            { key: 'gstPercent', label: 'GST %', w: 56, align: 'center' },
            { key: 'gstAmount', label: 'GST Amount', w: 78, align: 'right' },
            { key: 'total', label: 'Total', w: 64, align: 'right' },
          ];

      // Keep table strictly within page width even if custom columns are oversized.
      const minColWidth = 34;
      const tableCols = tableColsInput.map((col) => ({ ...col }));
      const rawWidth = tableCols.reduce((sum, c) => sum + (Number(c.w) || 0), 0);
      const scale = rawWidth > 0 ? (width / rawWidth) : 1;
      tableCols.forEach((col) => {
        col.w = Math.max(minColWidth, Math.floor((Number(col.w) || minColWidth) * scale));
      });

      let adjustedWidth = tableCols.reduce((sum, c) => sum + c.w, 0);
      let remainder = Math.round(width - adjustedWidth);
      if (remainder !== 0) {
        tableCols[tableCols.length - 1].w += remainder;
      }

      // If rounding made the last col too small, borrow pixels from earlier columns.
      if (tableCols[tableCols.length - 1].w < minColWidth) {
        let deficit = minColWidth - tableCols[tableCols.length - 1].w;
        tableCols[tableCols.length - 1].w = minColWidth;
        for (let i = tableCols.length - 2; i >= 0 && deficit > 0; i -= 1) {
          const spare = Math.max(0, tableCols[i].w - minColWidth);
          const take = Math.min(spare, deficit);
          tableCols[i].w -= take;
          deficit -= take;
        }
      }

      doc.rect(left, y, width, tableHeaderH).fillAndStroke('#D9D9D9', '#444444');
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9.5);

      let x = left;
      tableCols.forEach((col) => {
        doc.rect(x, y, col.w, tableHeaderH).stroke('#444444');
        doc.text(col.label, x + 4, y + 8, { width: col.w - 8, align: col.align, lineBreak: false });
        x += col.w;
      });

      y += tableHeaderH;
      const rowH = 28;
      doc.font('Helvetica').fontSize(10);
      rows.forEach((row) => {
        let rowX = left;
        tableCols.forEach((col) => {
          doc.rect(rowX, y, col.w, rowH).stroke('#444444');
          const value = row[col.key] ?? '';
          doc.text(String(value), rowX + 4, y + 8, { width: col.w - 8, align: col.align, lineBreak: false });
          rowX += col.w;
        });
        y += rowH;
      });

      const totalsBlockH = 26 + (totals.length * 24);
      doc.rect(left, y, width, totalsBlockH).stroke('#444444');
      const labelW = width - 110;
      let totalsY = y + 10;
      doc.font('Helvetica').fontSize(10);
      totals.forEach((line) => {
        doc.text(line.label, left + 8, totalsY, { width: labelW - 16, align: 'right' });
        doc.text(line.amount, left + labelW, totalsY, { width: 98, align: 'right' });
        totalsY += 24;
      });
      y += totalsBlockH;

      doc.rect(left, y, width - 110, 30).stroke('#444444');
      doc.rect(left + width - 110, y, 110, 30).stroke('#444444');
      doc.font('Helvetica-Bold').fontSize(12).text('Total Amount', left + 12, y + 9);
      doc.font('Helvetica-Bold').fontSize(12).text(formatAmount(totalAmount), left + width - 106, y + 9, { width: 102, align: 'right' });
      y += 30;

      doc.rect(left, y, width, 32).stroke('#444444');
      doc.font('Helvetica-Bold').fontSize(10.5).text(toWords(totalAmount), left + 12, y + 9, { width: width - 24 });
      y += 32;

      doc.font('Helvetica').fontSize(10).text('This is computer generated invoice', left, y + 8, { width, align: 'center' });
    };

    const invoiceDate = billing.orderMeta.createdAt
      ? new Date(billing.orderMeta.createdAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const foodDiscountRatio = customerBill.itemsTotal > 0
      ? r2(customerBill.restaurantDiscount / customerBill.itemsTotal)
      : 0;
    const foodGstRatio = customerBill.subTotal > 0
      ? r2(customerBill.gstOnFood.total / customerBill.subTotal)
      : 0;

    const foodRows = customerBill.items.map((item, index) => {
      const lineAmount = r2(item.total);
      const lineDiscount = r2(lineAmount * foodDiscountRatio);
      const lineTaxable = r2(lineAmount - lineDiscount);
      const lineGst = r2(lineTaxable * foodGstRatio);
      return {
        sno: index + 1,
        name: item.name,
        amount: formatAmount(lineAmount),
        discount: formatAmount(lineDiscount),
        taxable: formatAmount(lineTaxable),
        gstPercent: `${formatAmount(customerBill.gstOnFood.percent)}%`,
        gstAmount: formatAmount(lineGst),
        total: formatAmount(lineTaxable + lineGst),
      };
    });
    if (customerBill.packaging.charge > 0) {
      foodRows.push({
        sno: foodRows.length + 1,
        name: 'Packaging Charges',
        amount: formatAmount(customerBill.packaging.charge),
        discount: formatAmount(0),
        taxable: formatAmount(customerBill.packaging.charge),
        gstPercent: `${formatAmount(customerBill.packaging.charge > 0 ? (customerBill.packaging.gst / customerBill.packaging.charge) * 100 : 0)}%`,
        gstAmount: formatAmount(customerBill.packaging.gst),
        total: formatAmount(customerBill.packaging.total),
      });
    }

    const firstPageCgst = r2(customerBill.gstOnFood.cgst + customerBill.packaging.cgst);
    const firstPageSgst = r2(customerBill.gstOnFood.sgst + customerBill.packaging.sgst);
    const firstPageTotalGst = r2(customerBill.gstOnFood.total + customerBill.packaging.gst);

    const foodTotals = [
      { label: 'Discount', amount: formatAmount(customerBill.restaurantDiscount) },
      { label: 'CGST', amount: formatAmount(firstPageCgst) },
      { label: 'SGST', amount: formatAmount(firstPageSgst) },
      { label: 'Total GST Amount', amount: formatAmount(firstPageTotalGst) },
    ];

    drawInvoiceFrame({
      invoiceNo: `FD/${String(billing.orderMeta.orderId || '').slice(-6)}/01`,
      orderDisplayId: billing.orderMeta.orderId || '',
      pageDate: invoiceDate,
      rows: foodRows,
      totals: foodTotals,
      totalAmount: foodInvoiceTotal,
      issuedByLabel: 'Invoice issued by Foodie on behalf of:',
      columns: [
        { key: 'sno', label: 'S.No.', w: 35, align: 'center' },
        { key: 'name', label: 'Description', w: 125, align: 'left' },
        { key: 'amount', label: 'Amount', w: 60, align: 'right' },
        { key: 'discount', label: 'Discount', w: 60, align: 'right' },
        { key: 'taxable', label: 'Taxable', w: 60, align: 'right' },
        { key: 'gstPercent', label: 'GST %', w: 45, align: 'center' },
        { key: 'gstAmount', label: 'GST Amt', w: 60, align: 'right' },
        { key: 'total', label: 'Total', w: 70, align: 'right' },
      ],
    });

    doc.addPage();

    const chargeRows = [
      {
        sno: 1,
        name: 'Platform Fee',
        amount: formatAmount(customerBill.platformFee.amount),
        discount: formatAmount(customerBill.platformFee.discountApplied),
        taxable: formatAmount(customerBill.platformFee.finalAmount),
        gstPercent: `${formatAmount(customerBill.platformFee.percent || (customerBill.platformFee.finalAmount > 0 ? (customerBill.platformFee.gst / customerBill.platformFee.finalAmount) * 100 : 0))}%`,
        gstAmount: formatAmount(customerBill.platformFee.gst),
        total: formatAmount(customerBill.platformFee.total),
      },
      {
        sno: 2,
        name: 'Delivery Charges',
        amount: formatAmount(customerBill.delivery.originalCharge),
        discount: formatAmount(customerBill.delivery.discountApplied),
        taxable: formatAmount(customerBill.delivery.finalCharge),
        gstPercent: `${formatAmount(customerBill.delivery.percent || (customerBill.delivery.finalCharge > 0 ? (customerBill.delivery.gst / customerBill.delivery.finalCharge) * 100 : 0))}%`,
        gstAmount: formatAmount(customerBill.delivery.gst),
        total: formatAmount(customerBill.delivery.total),
      },
    ];

    const chargeTotals = [
      { label: 'CGST', amount: formatAmount(r2(customerBill.platformFee.cgst + customerBill.delivery.cgst)) },
      { label: 'SGST', amount: formatAmount(r2(customerBill.platformFee.sgst + customerBill.delivery.sgst)) },
      { label: 'Total GST Amount', amount: formatAmount(r2(customerBill.platformFee.gst + customerBill.delivery.gst)) },
      { label: 'Delivery Discount', amount: formatAmount(customerBill.delivery.discountApplied) },
      { label: 'Final Delivery Charges', amount: formatAmount(customerBill.delivery.finalCharge) },
      ...(customerBill.couponType === 'free_delivery'
        ? [{ label: 'Free Delivery Applied', amount: formatAmount(customerBill.delivery.discountApplied) }]
        : [{ label: 'Coupon Discount', amount: formatAmount(customerBill.couponDiscount) }]),
      { label: 'Tip', amount: formatAmount(customerBill.tip) },
      { label: 'Small Cart Fee', amount: formatAmount(customerBill.smallCartFee) },
      ...(!nearlyEqual(chargeRoundOffAdjustment, 0) ? [{ label: 'Round Off Adjustment', amount: formatAmount(chargeRoundOffAdjustment) }] : []),
    ];

    drawInvoiceFrame({
      invoiceNo: `FD/${String(billing.orderMeta.orderId || '').slice(-6)}/02`,
      orderDisplayId: billing.orderMeta.orderId || '',
      pageDate: invoiceDate,
      rows: chargeRows,
      totals: chargeTotals,
      totalAmount: chargeInvoiceTotal,
      issuedByLabel: 'Invoice issued by Foodie:',
      columns: [
        { key: 'sno', label: 'S.No.', w: 35, align: 'center' },
        { key: 'name', label: 'Description', w: 110, align: 'left' },
        { key: 'amount', label: 'Amount', w: 70, align: 'right' },
        { key: 'discount', label: 'Discount', w: 70, align: 'right' },
        { key: 'taxable', label: 'Taxable', w: 60, align: 'right' },
        { key: 'gstPercent', label: 'GST %', w: 50, align: 'center' },
        { key: 'gstAmount', label: 'GST Amt', w: 70, align: 'right' },
        { key: 'total', label: 'Total', w: 50, align: 'right' },
      ],
    });

    if (!nearlyEqual(combinedInvoiceTotal, customerBill.finalPayableAmount)) {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(12).text('Validation Notes');
      doc.font('Helvetica').fontSize(10).text(`Combined customer invoice total ${formatCurrency(combinedInvoiceTotal)} does not match final payable ${formatCurrency(customerBill.finalPayableAmount)}.`);
    }
  });
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * generateBills
 * Generates (or skips if already generated) CustomerBill, RestaurantBill, RiderBill.
 *
 * @param {string|mongoose.Types.ObjectId} orderId
 * @returns {object}  { alreadyGenerated, customerBill, restaurantBill, riderBill }
 */
async function generateBills(orderId) {
  // ── 1. Idempotency guard ───────────────────────────────────────────────────
  const existing = await CustomerBill.findOne({ order: orderId }).select('_id').lean();
  if (existing) {
    return { alreadyGenerated: true };
  }

  // ── 2. Load the full order ─────────────────────────────────────────────────
  const order = await Order.findById(orderId).lean();
  if (!order) throw new Error(`billingService: Order ${orderId} not found`);
  const billing = buildBillingDataFromOrder(order);

  // ── 4. Create bills ────────────────────────────────────────────────────────
  const billPromises = [];

  // CustomerBill
  billPromises.push(
    CustomerBill.create({
      order:              order._id,
      customer:           order.customer,
      restaurant:         order.restaurant,
      itemsTotal:         billing.customerBill.itemsTotal,
      restaurantDiscount: billing.customerBill.restaurantDiscount,
      platformDiscount:   billing.customerBill.couponDiscount,
      discountTotal:      r2(billing.customerBill.restaurantDiscount + billing.customerBill.couponDiscount),
      gstOnFood:          {
        percent: billing.customerBill.gstOnFood.percent,
        base: billing.customerBill.subTotal,
        total: billing.customerBill.gstOnFood.total,
        cgst: billing.customerBill.gstOnFood.cgst,
        sgst: billing.customerBill.gstOnFood.sgst,
      },
      packagingCharge:    billing.customerBill.packaging.charge,
      gstOnPackaging:     {
        percent: r2(billing.customerBill.packaging.charge > 0 ? (billing.customerBill.packaging.gst / billing.customerBill.packaging.charge) * 100 : 0),
        base: billing.customerBill.packaging.charge,
        total: billing.customerBill.packaging.gst,
        cgst: billing.customerBill.packaging.cgst,
        sgst: billing.customerBill.packaging.sgst,
      },
      platformFee:        billing.customerBill.platformFee.finalAmount,
      gstOnPlatform:      {
        percent: r2(billing.customerBill.platformFee.finalAmount > 0 ? (billing.customerBill.platformFee.gst / billing.customerBill.platformFee.finalAmount) * 100 : 0),
        base: billing.customerBill.platformFee.finalAmount,
        total: billing.customerBill.platformFee.gst,
        cgst: billing.customerBill.platformFee.cgst,
        sgst: billing.customerBill.platformFee.sgst,
      },
      deliveryCharge:     billing.customerBill.delivery.finalCharge,
      gstOnDelivery:      {
        percent: r2(billing.customerBill.delivery.finalCharge > 0 ? (billing.customerBill.delivery.gst / billing.customerBill.delivery.finalCharge) * 100 : 0),
        base: billing.customerBill.delivery.finalCharge,
        total: billing.customerBill.delivery.gst,
        cgst: billing.customerBill.delivery.cgst,
        sgst: billing.customerBill.delivery.sgst,
      },
      tip:                billing.customerBill.tip,
      totalGst:           {
        cgst: billing.gstSummary.cgstTotal - splitHalf(billing.gstSummary.commissionGst).cgst,
        sgst: billing.gstSummary.sgstTotal - splitHalf(billing.gstSummary.commissionGst).sgst,
        total: billing.gstSummary.totalGst - billing.gstSummary.commissionGst,
      },
      finalPayableAmount: billing.customerBill.finalPayableAmount,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      couponCode:    order.couponCode || null,
      generatedAt:   new Date(),
    }),
  );

  // RestaurantBill
  billPromises.push(
    RestaurantBill.create({
      order:                  order._id,
      restaurant:             order.restaurant,
      customer:               order.customer,
      itemsTotal:             billing.restaurantBill.itemsTotal,
      gstOnFood:              {
        percent: billing.customerBill.gstOnFood.percent,
        base: billing.customerBill.subTotal,
        total: billing.restaurantBill.gst.foodGst,
        cgst: billing.restaurantBill.gst.foodCgst,
        sgst: billing.restaurantBill.gst.foodSgst,
      },
      restaurantDiscount:     billing.restaurantBill.restaurantDiscount,
      packagingCharge:        billing.restaurantBill.packaging,
      gstOnPackaging:         {
        percent: r2(billing.restaurantBill.packaging > 0 ? (billing.restaurantBill.gst.packagingGst / billing.restaurantBill.packaging) * 100 : 0),
        base: billing.restaurantBill.packaging,
        total: billing.restaurantBill.gst.packagingGst,
        cgst: billing.restaurantBill.gst.packagingCgst,
        sgst: billing.restaurantBill.gst.packagingSgst,
      },
      adminCommissionPercent: billing.restaurantBill.commission.commissionPercent,
      adminCommissionAmount:  billing.restaurantBill.commission.commissionAmount,
      gstOnAdminCommission:   {
        percent: billing.restaurantBill.commission.commissionAmount > 0 ? r2((billing.restaurantBill.commission.commissionGst / billing.restaurantBill.commission.commissionAmount) * 100) : 0,
        base: billing.restaurantBill.commission.commissionAmount,
        total: billing.restaurantBill.commission.commissionGst,
        cgst: billing.restaurantBill.commission.cgstOnCommission,
        sgst: billing.restaurantBill.commission.sgstOnCommission,
      },
      restaurantNetEarning:   billing.restaurantBill.restaurantNetEarning,
      generatedAt: new Date(),
    }),
  );

  // RiderBill — only if a rider is assigned
  if (order.rider) {
    billPromises.push(
      RiderBill.create({
        order:              order._id,
        rider:              order.rider,
        restaurant:         order.restaurant,
        customer:           order.customer,
        deliveryCharge:     Math.max(0, billing.riderBill.deliveryCharge),
        platformFeeCredit:  Math.max(0, billing.riderBill.platformFeeShare),
        incentive:          billing.riderBill.incentive,
        incentivePercent:   billing.riderBill.incentivePercent,
        tip:                billing.riderBill.tip,
        riderTotalEarning:  r2(billing.riderBill.totalRiderEarning),
        paymentMethod:      order.paymentMethod,
        generatedAt:        new Date(),
      }),
    );
  }

  const [customerBill, restaurantBill, riderBill] = await Promise.all(billPromises);

  return {
    alreadyGenerated: false,
    customerBill,
    restaurantBill,
    riderBill: riderBill || null,
  };
}

module.exports = {
  generateBills,
  buildBillingDataFromOrder,
  validateBillingData,
  generateInvoicePdfBuffer,
  generateCustomerInvoicePdfBuffer,
};
