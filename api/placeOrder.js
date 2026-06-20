import admin, { db } from './firebase-init.js';

/**
 * Secure order placement with server-side validation
 * 1. Validates meal prices against menu
 * 2. Verifies order total calculation
 * 3. Creates order with paid=false
 * 4. Debits wallet in transaction
 * 5. Marks order as paid only after successful debit
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const userId = decodedToken.uid;
  const userEmail = decodedToken.email;
  const { items, forDate, clientTotal } = req.body;

  if (!items || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Invalid items' });
  }
  if (!forDate || typeof forDate !== 'string') {
    return res.status(400).json({ error: 'Invalid forDate' });
  }
  if (typeof clientTotal !== 'number' || clientTotal <= 0) {
    return res.status(400).json({ error: 'Invalid total' });
  }

  try {
    // 1. Fetch menu to verify meal prices
    const mealsSnap = await db.collection('meals').get();
    const mealsById = {};
    mealsSnap.docs.forEach(doc => {
      mealsById[doc.id] = doc.data();
    });

    // 2. Validate each item and recalculate total on server
    let serverTotal = 0;
    const validatedItems = [];

    for (const item of items) {
      if (!item.mealId || !item.qty || item.qty <= 0) {
        return res.status(400).json({ error: 'Invalid item: mealId and qty required' });
      }

      const meal = mealsById[item.mealId];
      if (!meal) {
        return res.status(400).json({ error: `Meal ${item.mealId} not found in menu` });
      }

      // Use server menu price, not client-provided price
      const serverPrice = Number(meal.price || 0);
      if (serverPrice <= 0 || !Number.isFinite(serverPrice)) {
        return res.status(400).json({ error: `Meal ${item.mealId} has invalid price` });
      }

      // Validate quantity is a positive integer
      const qtyNum = Number(item.qty);
      if (!Number.isInteger(qtyNum) || qtyNum <= 0 || qtyNum > 100) {
        return res.status(400).json({ error: `Invalid quantity for meal ${item.mealId}: must be integer 1-100` });
      }
      const qty = qtyNum;

      validatedItems.push({
        mealId: item.mealId,
        name: meal.name || '',
        price: serverPrice,
        qty
      });
      serverTotal += serverPrice * qty;
    }

    if (!validatedItems.length) {
      return res.status(400).json({ error: 'No valid items in order' });
    }

    if (serverTotal <= 0 || !Number.isFinite(serverTotal)) {
      return res.status(400).json({ error: 'Invalid order total' });
    }

    // 3. Verify client calculation matches server calculation (STRICT - no tolerance for financial transactions)
    if (serverTotal !== clientTotal) {
      return res.status(400).json({
        error: 'PRICE_MISMATCH',
        message: `Order total mismatch: server calculated ${serverTotal}৳, client sent ${clientTotal}৳`
      });
    }

    // 4. Use transaction to create order and debit wallet atomically
    const result = await db.runTransaction(async (transaction) => {
      // Get current wallet balance
      const walletRef = db.collection('wallets').doc(userId);
      const walletSnap = await transaction.get(walletRef);
      const currentBalance = walletSnap.exists ? Number(walletSnap.data().balance || 0) : 0;

      if (currentBalance < serverTotal) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      const newBalance = currentBalance - serverTotal;

      // Create order with paid=false initially
      const orderRef = db.collection('orders').doc();
      transaction.set(orderRef, {
        userId,
        userEmail: userEmail.toLowerCase(),
        forDate,
        items: validatedItems,
        total: serverTotal,
        status: 'placed',
        paid: false, // Will be set to true after debit succeeds
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Debit wallet
      transaction.update(walletRef, {
        balance: newBalance,
        email: userEmail.toLowerCase(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Create wallet history entry
      const historyRef = db.collection('walletHistory').doc();
      transaction.set(historyRef, {
        userId,
        userEmail: userEmail.toLowerCase(),
        type: 'order_debit',
        amount: -serverTotal,
        balanceAfter: newBalance,
        ref: orderRef.id,
        note: 'Order for ' + forDate,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Update order paid status to true
      transaction.update(orderRef, {
        paid: true,
        paidAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        orderId: orderRef.id,
        newBalance,
        total: serverTotal
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    const { sendErrorResponse } = await import('./error-handler.js');
    return sendErrorResponse(res, error, 'Failed to place order');
  }
}
