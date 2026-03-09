# RIDER EARNINGS BREAKDOWN - QUICK VISUAL REFERENCE

## The Three Earning Components

```
┌─────────────────────────────────────────────────────────────┐
│              RIDER TOTAL EARNINGS = ₹114                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Component 1: DELIVERY CHARGE        ₹40 (35%)             │
│  ├─ Base Earning........................₹30                 │
│  └─ Distance Bonus (4km × ₹5)........₹10                  │
│                                                               │
│  Component 2: PLATFORM FEE           ₹9 (8%)               │
│  └─ Rider's share of platform fee...₹9                    │
│                                                               │
│  Component 3: INCENTIVE               ₹65 (57%)            │
│  └─ Performance bonus (₹1000 × 5%)..₹65                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 1️⃣ DELIVERY CHARGE CALCULATION

**Formula:**
```
Delivery Charge = Base Amount + Distance Bonus

Base Amount = ₹30 (default setting)
Distance Bonus = (Distance - 3km) × ₹5/km (if distance > 3km)
```

**Examples:**

### Short Distance (2 km)
```
Distance: 2 km
Base: ₹30
Distance Bonus: 0 (because 2 < 3 km base)
────────────────
Delivery Charge: ₹30
```

### Medium Distance (5 km)
```
Distance: 5 km
Base: ₹30
Distance Bonus: (5 - 3) × ₹5 = ₹10
────────────────
Delivery Charge: ₹40
```

### Long Distance (12 km)
```
Distance: 12 km
Base: ₹30
Distance Bonus: (12 - 3) × ₹5 = ₹45
────────────────
Delivery Charge: ₹75
```

---

## 2️⃣ PLATFORM FEE BREAKDOWN

**Current Model:**
```
Rider gets: 100% of platform fee from order
Example: If order has ₹9 platform fee, rider gets all ₹9
```

**Alternative Models (Can be configured):**

### Model A: Ride Gets Full Fee (Current)
```
Customer pays platform fee: ₹9
Rider receives: ₹9 (100%)
Admin keeps: ₹0
```

### Model B: Split between Rider & Admin
```
Customer pays: ₹9
Rider receives: ₹4.50 (50%)
Admin keeps: ₹4.50 (50%)
```

### Model C: Rider Gets Small Share
```
Customer pays: ₹9
Rider receives: ₹2.25 (25%)
Admin keeps: ₹6.75 (75%)
```

**Current Setting:** Model A (Rider 100%)

---

## 3️⃣ INCENTIVE CALCULATION

**Formula:**
```
Incentive = Order Item Total × Incentive Percent / 100

Key: Uses ITEM TOTAL (before GST), not final amount
Why: GST is pass-through tax, not actual revenue
```

**Examples:**

### Basic Order
```
Item Total: ₹1000 (before GST)
Incentive %: 5%
─────────────────
Incentive: ₹1000 × 5 / 100 = ₹50

(GST of ₹180 not included in incentive calculation)
```

### High Value Order
```
Item Total: ₹3000 (before GST)
Incentive %: 5%
─────────────────
Incentive: ₹3000 × 5 / 100 = ₹150
```

### Low Value Order
```
Item Total: ₹200 (before GST)
Incentive %: 5%
─────────────────
Incentive: ₹200 × 5 / 100 = ₹10
```

---

## Complete Order Example

### Order Details
```
Restaurant: Taj Restaurant
Items: 
  - Biryani (₹250)
  - Butter Chicken (₹300)
  - Naan (₹50)
  Item Subtotal: ₹600

Taxes:
  GST (18%): ₹108
  Delivery Fee: ₹40
  Platform Fee: ₹9

Total Amount Paid: ₹757
Delivery Distance: 8 km
Payment Method: COD
```

### Earnings Calculation

**Step 1: Delivery Charge**
```
Base: ₹30
Distance Bonus: (8 - 3) × ₹5 = ₹25
= ₹55
```

**Step 2: Platform Fee**
```
Rider gets: ₹9
```

**Step 3: Incentive**
```
Item Total (before GST): ₹600
Incentive %: 5%
= ₹600 × 5 / 100 = ₹30
```

**Total Rider Earning:**
```
Delivery Charge:  ₹55
Platform Fee:     ₹9
Incentive:        ₹30
──────────────────────
TOTAL:            ₹94

Also receives: ₹757 (COD collected cash)
```

### Breakdown Percentages
```
Delivery Charge: ₹55 (58%)
Platform Fee:    ₹9 (10%)
Incentive:       ₹30 (32%)
```

---

## 📊 Visualizing Earnings Distribution

### Typical Order (₹50-60 range)
```
╔══════════════════════════════════════╗
║   Order Value: ₹1000 (Item Total)   ║
╠══════════════════════════════════════╣
║                                       ║
║  Delivery Charge    ₹35 ████████    ║
║  (5-10 km distance)                 ║
║                                       ║
║  Platform Fee       ₹9 ██            ║
║  (Fixed)                             ║
║                                       ║
║  Incentive          ₹50 ███████████  ║
║  (5% of ₹1000)                       ║
║                                       ║
║                Total: ₹94             ║
╚══════════════════════════════════════╝
```

### Peak Hours Incentive Boost (Future)
```
Normal Hour:
  Incentive: 5% = ₹50

Peak Hour (12-2 PM):
  Incentive: 5% + ₹10 bonus = ₹60

Night Shift (11 PM-6 AM):
  Incentive: 5% + ₹20 bonus = ₹70
```

---

## 💰 Daily Earnings Example

### Rider Completes 10 Orders
```
Order #1:  Delivery ₹30 + Platform ₹9 + Incentive ₹40 = ₹79
Order #2:  Delivery ₹40 + Platform ₹9 + Incentive ₹35 = ₹84
Order #3:  Delivery ₹50 + Platform ₹9 + Incentive ₹60 = ₹119
Order #4:  Delivery ₹35 + Platform ₹9 + Incentive ₹45 = ₹89
Order #5:  Delivery ₹45 + Platform ₹9 + Incentive ₹55 = ₹109
Order #6:  Delivery ₹30 + Platform ₹9 + Incentive ₹30 = ₹69
Order #7:  Delivery ₹40 + Platform ₹9 + Incentive ₹50 = ₹99
Order #8:  Delivery ₹55 + Platform ₹9 + Incentive ₹75 = ₹139
Order #9:  Delivery ₹35 + Platform ₹9 + Incentive ₹25 = ₹69
Order #10: Delivery ₹45 + Platform ₹9 + Incentive ₹65 = ₹119

═══════════════════════════════════════════════════════════════
Daily Summary:
  Total Delivery Charges: ₹405 (47%)
  Total Platform Fees:    ₹90  (10%)
  Total Incentives:       ₹480 (56%)
═══════════════════════════════════════════════════════════════
  TOTAL DAILY EARNINGS:   ₹975

  Average per order: ₹97.50
```

---

## 🎯 Admin Controls

### Default Settings
```
┌─────────────────────────────────────┐
│  ADMIN SETTINGS - RIDER PAYOUTS    │
├─────────────────────────────────────┤
│  Base Delivery Charge: ₹30          │
│  Per-KM Rate: ₹5                    │
│  Base Distance: 3 km                │
│  Incentive Percentage: 5%           │
│  Platform Fee Share: 100%           │
└─────────────────────────────────────┘
```

### What Happens If Admin Changes Settings

**Scenario 1: Increase Base to ₹40**
```
Old: ₹30 base + ₹25 bonus = ₹55
New: ₹40 base + ₹25 bonus = ₹65 [+₹10 per delivery]
```

**Scenario 2: Increase Incentive to 7%**
```
Old: ₹1000 × 5% = ₹50
New: ₹1000 × 7% = ₹70 [+₹20 per ₹1000 order]
```

**Scenario 3: Increase Per-KM Rate to ₹7**
```
Old: (8-3) × ₹5 = ₹25 distance bonus
New: (8-3) × ₹7 = ₹35 distance bonus [+₹10 for 5km]
```

---

## 📱 What Rider Sees

### On Delivery Offer
```
┌──────────────────────────────────┐
│  🍽️ NEW DELIVERY ORDER           │
├──────────────────────────────────┤
│  Restaurant: Taj Restaurant       │
│  Distance: 5 km                   │
│  Items: 3 items                   │
│                                   │
│  EARNINGS BREAKDOWN:              │
│  ├─ Delivery Charge: ₹40         │
│  ├─ Platform Fee: ₹9             │
│  ├─ Incentive: ₹50               │
│  └─ TOTAL: ₹99                   │
│                                   │
│  [ACCEPT] [DECLINE]              │
└──────────────────────────────────┘
```

### On Dashboard (Weekly Summary)
```
┌────────────────────────────────────┐
│  👤 MY EARNINGS - THIS WEEK        │
├────────────────────────────────────┤
│                                     │
│  🚚 Deliveries:           35       │
│  📊 Total Earnings:    ₹3,400      │
│  💵 Avg per Delivery:     ₹97      │
│                                     │
│  BREAKDOWN:                         │
│  ├─ Delivery: ₹1,400 (41%)        │
│  ├─ Platform: ₹350 (10%)          │
│  └─ Incentive: ₹1,650 (49%)       │
│                                     │
│  💰 Ready for Payout: ₹2,000       │
│  🏦 COD Cash in Hand: ₹1,400       │
│                                     │
│  [VIEW DETAILS]                    │
└────────────────────────────────────┘
```

---

## 🔄 Wallet Flow

### During Delivery
```
Rider Accepts Order
   ↓
[NO EARNINGS YET]
   ↓
Rider Picks Item
   ↓
[NO EARNINGS YET]
   ↓
Rider Delivers Item
   ↓
Rider Marks as Delivered
   ↓
EARNINGS CALCULATED
   ├─ Delivery Charge: ₹40
   ├─ Platform Fee: ₹9
   └─ Incentive: ₹50
   ↓
Total Earnings: ₹99 CREDITED TO WALLET
Total COD Cash: +₹757 (if COD order)
```

### Wallet After Delivery
```
Before Delivery:
  Total Earnings: ₹5,000
  Available Balance: ₹1,500
  Cash in Hand: ₹3,500

After Delivery (COD order, ₹757 collected):
  Total Earnings: ₹5,099 (+₹99)
  Available Balance: ₹1,599 (+₹99)
  Cash in Hand: ₹4,257 (+₹757)
```

### If Cash Limit Exceeded
```
Cash Limit: ₹20,000
Cash in Hand Before: ₹19,500
COD Order Amount: ₹757

New Cash Balance: ₹19,500 + ₹757 = ₹20,257 (EXCEEDS ₹20,000)

Result: ⛔ ACCOUNT FROZEN
Message: "Please deposit ₹257 to unfreeze account"
Rider Status: Cannot accept new deliveries until unfrozen
```

---

## 📈 Monthly Earnings Report Example

```
MONTH: MARCH 2026
═══════════════════════════════════════════════════════════

Total Deliveries: 350

EARNING COMPONENTS:
──────────────────────────────────────────────────────────
Delivery Charges:      ₹14,000  (43%)
Platform Fees:         ₹2,800   (9%)
Incentives:           ₹16,200   (48%)
──────────────────────────────────────────────────────────
TOTAL EARNINGS:       ₹33,000

AVAILABLE FOR PAYOUT: ₹27,500 (after deductions)

CASH COLLECTED (COD): ₹89,234
PAYOUTS RECEIVED:     ₹22,000


TOP PERFORMING DAYS:
├─ March 9: 45 orders = ₹4,235 earned
├─ March 16: 48 orders = ₹4,542 earned
└─ March 23: 42 orders = ₹4,018 earned

LOWEST PERFORMING DAY:
└─ March 1: 18 orders = ₹1,650 earned
```

---

## ⚙️ Configuration Keywords

When talking about earnings, these are the key terms:

| Term | Default | Meaning |
|------|---------|---------|
| riderBaseEarningPerDelivery | ₹30 | Base earnings per order |
| riderPerKmRate | ₹5 | Extra money per km |
| riderBaseDistanceKm | 3 | Distance included in base |
| riderIncentivePercent | 5% | Bonus percentage on order value |
| platformFee | ₹9 | Rider's platform fee share |
| cashLimit | ₹20,000 | Max COD cash before freeze |

---

## 🚀 Quick Formulas for Manual Calculation

### Delivery Charge
```
If distance ≤ 3 km:  Delivery = ₹30
If distance > 3 km:  Delivery = ₹30 + ((distance - 3) × ₹5)
```

### Incentive
```
Incentive = Order Item Total × 5 / 100
(Always use ItemTotal, NOT final amount with taxes/fees)
```

### Total Earnings
```
Total = DeliveryCharge + PlatformFee + Incentive
Total = DeliveryCharge + ₹9 + Incentive
```

---

## ✅ Verification Checklist

### For Each Order Delivered:

- [ ] Earnings calculated within 5 seconds of delivery marking
- [ ] Delivery charge = base + distance bonus (correct calculation)
- [ ] Platform fee = ₹9 credited
- [ ] Incentive = itemTotal × incentivePercent / 100 (correct)
- [ ] Total = sum of three components
- [ ] Rider wallet updated (totalEarnings increased)
- [ ] Rider available balance updated
- [ ] If COD: cash in hand increased by order amount
- [ ] Transaction record created in PaymentTransaction
- [ ] No duplicate earnings for same order

---

## 📞 Common Questions

**Q: Why is incentive based on itemTotal, not final amount?**
A: GST is pass-through tax. Real value = itemTotal only.

**Q: Why does rider not get platform fee?**
A: Currently set to 100% —admin can change to 50%, 75%, etc.

**Q: What if distance is exactly 3 km?**
A: Counts as "included in base distance", no bonus. Bonus starts at >3 km.

**Q: Can settings change mid-month?**
A: Yes. Each order records incentivePercentAtCompletion (snapshot of % at that time).

**Q: What if rider is frozen?**
A: Cannot accept new orders until cash deposits and account unfrozen.

**Q: How often does wallet update?**
A: Immediately after delivery marked. Real-time.

---

## 🎓 Training Summary

- **3 Components**: Delivery Charge (distance-based), Platform Fee (fixed), Incentive (percentage-based)
- **Configuration**: All parameters in AdminSetting.payoutConfig
- **Real-Time**: Earnings credited immediately after 'delivered' status
- **Transparent**: Rider sees exact breakdown of each earning component
- **Audited**: Every transaction logged in PaymentTransaction
- **Safe**: Built-in cash limit prevents excessive accumulation

---

**This is the foundation of fair, transparent rider compensation! 🚀**
