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
    const visibleGstTotal = r2(
      (customerBill.gstOnFood.total || 0)
      + (customerBill.packaging.gst || 0)
      + (customerBill.platformFee.gst || 0)
      + (customerBill.delivery.gst || 0)
    );

    doc.font('Helvetica-Bold').fontSize(18).text('Customer Invoice', { align: 'center' });
    doc.moveDown(0.6);

    drawSectionHeading(doc, 'Order Info');
    drawInfoLine(doc, 'Order ID:', billing.orderMeta.orderId || '');
    drawInfoLine(doc, 'Status:', billing.orderMeta.status || '');
    drawInfoLine(doc, 'Created At:', billing.orderMeta.createdAt ? new Date(billing.orderMeta.createdAt).toISOString() : '');
    drawInfoLine(doc, 'Customer:', customer?.name || customer?.firstName || billing.orderMeta.customerId || '');
    drawInfoLine(doc, 'Restaurant:', restaurant?.name?.en || restaurant?.name || billing.orderMeta.restaurantId || '');
    drawInfoLine(doc, 'Payment Method:', billing.orderMeta.paymentMethod || '');
    drawInfoLine(doc, 'Payment Status:', billing.orderMeta.paymentStatus || '');

    drawAmountTable(
      doc,
      'Items Table',
      customerBill.items.map((item) => [
        `${item.name} x ${item.qty} @ ${formatCurrency(item.rate)}`,
        formatCurrency(item.total),
      ]),
    );

    drawAmountTable(doc, 'Pricing Summary', [
      ['Items Total', formatCurrency(customerBill.itemsTotal)],
      ['Restaurant Discount', formatCurrency(-customerBill.restaurantDiscount)],
      ['Sub Total', formatCurrency(customerBill.subTotal)],
    ]);

    const gstRows = [
      [`Food GST (${formatAmount(customerBill.gstOnFood.percent)}%)`, formatCurrency(customerBill.gstOnFood.total)],
      [`CGST (${formatAmount(customerBill.gstOnFood.percent / 2)}%)`, formatCurrency(customerBill.gstOnFood.cgst)],
      [`SGST (${formatAmount(customerBill.gstOnFood.percent / 2)}%)`, formatCurrency(customerBill.gstOnFood.sgst)],
      ['Packaging CGST', formatCurrency(customerBill.packaging.cgst)],
      ['Packaging SGST', formatCurrency(customerBill.packaging.sgst)],
      ['Platform CGST', formatCurrency(customerBill.platformFee.cgst)],
      ['Platform SGST', formatCurrency(customerBill.platformFee.sgst)],
    ];
    if (customerBill.delivery.gst > 0) {
      gstRows.push(['Delivery CGST', formatCurrency(customerBill.delivery.cgst)]);
      gstRows.push(['Delivery SGST', formatCurrency(customerBill.delivery.sgst)]);
    }
    gstRows.push(['Visible GST Total', formatCurrency(visibleGstTotal)]);
    drawAmountTable(doc, 'GST Breakdown', gstRows);

    drawAmountTable(doc, 'Charges', [
      ['Packaging Charge', formatCurrency(customerBill.packaging.charge)],
      ['Packaging GST', formatCurrency(customerBill.packaging.gst)],
      ['Platform Fee', formatCurrency(customerBill.platformFee.amount)],
      ['Platform Fee Discount', formatCurrency(-customerBill.platformFee.discountApplied)],
      ['Platform Fee Final', formatCurrency(customerBill.platformFee.finalAmount)],
      ['Platform GST', formatCurrency(customerBill.platformFee.gst)],
      ['Delivery Fee', formatCurrency(customerBill.delivery.originalCharge)],
      ['Delivery Discount', formatCurrency(-customerBill.delivery.discountApplied)],
      ['Final Delivery', formatCurrency(customerBill.delivery.finalCharge)],
      ...(customerBill.delivery.gst > 0 ? [['Delivery GST', formatCurrency(customerBill.delivery.gst)]] : []),
    ]);

    const couponLabel = customerBill.couponType === 'free_delivery'
      ? `Free Delivery Applied (-${formatCurrency(customerBill.delivery.discountApplied)})`
      : (customerBill.couponCode ? `Coupon Applied (${customerBill.couponCode})` : 'Coupon');
    const couponAmount = customerBill.couponType === 'free_delivery'
      ? formatCurrency(-customerBill.delivery.discountApplied)
      : formatCurrency(-customerBill.couponDiscount);
    drawAmountTable(doc, 'Coupon', [
      [couponLabel, couponAmount],
    ]);

    drawAmountTable(doc, 'Tip', [
      ['Tip', formatCurrency(customerBill.tip)],
    ]);

    drawAmountTable(doc, 'Final Total', [
      ['Small Cart Fee', formatCurrency(customerBill.smallCartFee)],
      ['Final Payable Amount', formatCurrency(customerBill.finalPayableAmount)],
    ]);

    if (!billing.validation.isValid) {
      drawSectionHeading(doc, 'Validation Notes');
      doc.font('Helvetica').fontSize(10);
      billing.validation.issues.forEach((issue) => doc.text(`- ${issue}`));
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
