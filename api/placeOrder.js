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
        throw new Error('Invalid item: mealId and qty required');
      }

      const meal = mealsById[item.mealId];
      if (!meal) {
        throw new Error(`Meal ${item.mealId} not found in menu`);
      }

      // Use server menu price, not client-provided price
      const serverPrice = Number(meal.price || 0);
      if (serverPrice <= 0) {
        throw new Error(`Meal ${item.mealId} has invalid price`);
      }

      const qty = Math.max(0, Math.min(item.qty, 100)); // Cap quantity at 100
      if (qty > 0) {
        validatedItems.push({
          mealId: item.mealId,
          name: meal.name || '',
          price: serverPrice,
          qty
        });
        serverTotal += serverPrice * qty;
      }
    }

    if (!validatedItems.length) {
      throw new Error('No valid items in order');
    }

    // 3. Verify client calculation matches server calculation
    // Allow small rounding differences (1 taka tolerance)
    const diff = Math.abs(serverTotal - clientTotal);
    if (diff > 1) {
      return res.status(400).json({
        error: 'PRICE_MISMATCH',
        message: `Order total mismatch: expected ${serverTotal}, got ${clientTotal}`
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
    console.error('Place order error:', error);

    if (error.message === 'INSUFFICIENT_FUNDS') {
      return res.status(402).json({ error: 'INSUFFICIENT_FUNDS' });
    }
    if (error.message?.includes('not found in menu')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message?.includes('Invalid')) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({ error: error.message || 'Failed to place order' });
  }
}
