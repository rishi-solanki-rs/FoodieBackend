# MongoDB DNS Connection Fix - Documentation

## Problem Encountered
**Error:** `querySrv ECONNREFUSED _mongodb._tcp.rishiserver.kdybcms.mongodb.net`

This error occurs when Node.js cannot perform SRV (Service Record) DNS lookups for MongoDB Atlas. It typically happens on systems configured with **Google DNS (8.8.8.8)** which blocks SRV queries.

## Root Cause
- Google DNS (8.8.8.8) blocks MongoDB SRV record lookups
- Other DNS providers (Cloudflare, ISP DNS) allow SRV lookups
- This caused connection failures on specific systems despite working on others

## Solution Implemented
### Permanent Fix in [config/db.js](config/db.js)
The fix forces Node.js to use **Cloudflare DNS** at the application level (no admin privileges needed):

```javascript
// Primary DNS: Cloudflare (recommended, allows SRV lookups)
dns.setServers(['1.1.1.1', '1.0.0.1']);

// Fallback DNS: Google (used if Cloudflare fails)
// This ensures maximum compatibility
```

### Why This Works
1. **Cloudflare DNS** (1.1.1.1) reliably performs MongoDB SRV lookups
2. Applied at **Node.js level** - no system admin access needed
3. **Fallback mechanism** - switches to Google DNS if Cloudflare fails
4. **Automatic retry logic** - 5 retries with exponential backoff

## How to Verify It's Working
```bash
npm start
# Look for these messages:
# ✅ MongoDB Connected: ac-47dqcfo-shard-00-00.kdybcms.mongodb.net
```

## For Team Members
If you experience similar MongoDB connection issues:

1. **This fix is automatic** - It's built into the startup code
2. **No configuration needed** - Just run `npm start`
3. **Works on all systems** - Even those using Google DNS

## Environment Variables
Currently configured in [.env](.env):
```env
MONGO_URI=mongodb+srv://rishi_solanki:Indore%40123@rishiserver.kdybcms.mongodb.net/Check
```

## Technical Details
- **DNS Override Method:** `dns.setServers()` at Node.js level
- **Primary DNS:** Cloudflare (1.1.1.1, 1.0.0.1)
- **Fallback DNS:** Google (8.8.4.4, 8.8.8.8)  
- **Connection Type:** MongoDB Atlas SRV (mongodb+srv://)
- **Retry Strategy:** 5 attempts with 1s → 2s → 4s → 8s → 16s delays
- **Timeout:** 15 seconds per connection attempt

## Alternative Solutions (If Needed)
If this fix doesn't work in an edge case:

1. **Use Direct Connection String** (bypasses SRV):
   ```
   mongodb://host1:27017,host2:27017,host3:27017/Check?retryWrites=true&w=majority
   ```

2. **System-Level DNS Change** (requires admin):
   - Change system DNS to Cloudflare (1.1.1.1)
   - Or contact ISP to use their DNS

3. **IP Whitelist Check**:
   - Ensure your IP is whitelisted in MongoDB Atlas Network Access
   - Add `0.0.0.0/0` temporarily to test, then restrict to your IP range

## References
- MongoDB Connection String: [docs.mongodb.com](https://docs.mongodb.com/manual/reference/connection-string/)
- Cloudflare DNS: [1.1.1.1](https://1.1.1.1/)
- Node.js DNS Module: [nodejs.org](https://nodejs.org/api/dns.html)
