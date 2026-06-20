import admin, { db } from './firebase-init.js';
import { notifyAdminsInternal } from './admin.js';
import { formatOrderNotification } from './format-notification.js';

async function placeOrder(req, res, userId, userEmail) {
  const { items, forDate, clientTotal } = req.body;

  if (!items || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Invalid items' });
  }
  if (!forDate || typeof forDate !== 'string') {
    return res.status(400).json({ error: 'Invalid forDate' });
  }
  if (typeof clientTotal !== 'number' || clientTotal <= 0 || !Number.isInteger(clientTotal)) {
    return res.status(400).json({ error: 'Invalid total: must be positive integer' });
  }

  try {
    const mealsSnap = await db.collection('meals').get();
    const mealsById = {};
    mealsSnap.docs.forEach(doc => {
      mealsById[doc.id] = doc.data();
    });

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

      const serverPrice = Number(meal.price || 0);
      if (serverPrice <= 0 || !Number.isFinite(serverPrice)) {
        return res.status(400).json({ error: `Meal ${item.mealId} has invalid price` });
      }

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

    if (serverTotal !== clientTotal) {
      return res.status(400).json({
        error: 'PRICE_MISMATCH',
        message: `Order total mismatch: server calculated ${serverTotal}৳, client sent ${clientTotal}৳`
      });
    }

    const result = await db.runTransaction(async (transaction) => {
      const walletRef = db.collection('wallets').doc(userId);
      const walletSnap = await transaction.get(walletRef);
      const currentBalance = walletSnap.exists ? Number(walletSnap.data().balance || 0) : 0;

      if (currentBalance < serverTotal) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      const newBalance = currentBalance - serverTotal;

      const orderRef = db.collection('orders').doc();
      transaction.set(orderRef, {
        userId,
        userEmail: userEmail.toLowerCase(),
        forDate,
        items: validatedItems,
        total: serverTotal,
        status: 'placed',
        paid: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      transaction.update(walletRef, {
        balance: newBalance,
        email: userEmail.toLowerCase(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

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

    const order = { forDate, items: validatedItems, total: serverTotal };
    notifyAdminsInternal({
      message: formatOrderNotification({ type: 'order-placed', order, userEmail }),
      link: 'orders-admin',
      linkText: 'View orders',
      type: 'order-placed'
    }).catch(() => {});

    return res.status(200).json(result);
  } catch (error) {
    const { sendErrorResponse } = await import('./error-handler.js');
    return sendErrorResponse(res, error, 'Failed to place order');
  }
}

async function cancelOrder(req, res, userId, userEmail) {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: 'Missing orderId' });
  }

  try {
    let orderData = null;
    const result = await db.runTransaction(async (transaction) => {
      const orderRef = db.collection('orders').doc(orderId);
      const orderSnap = await transaction.get(orderRef);

      if (!orderSnap.exists) {
        throw new Error('Order not found');
      }

      const order = orderSnap.data();
      orderData = order;

      if (order.userId !== userId && order.userEmail !== userEmail) {
        throw new Error('Order does not belong to this user');
      }

      if (order.status === 'cancelled') {
        throw new Error('Order already cancelled');
      }
      if (order.status !== 'placed') {
        throw new Error('Order cannot be cancelled (status: ' + order.status + ')');
      }

      const refundAmount = Number(order.total || 0);
      if (refundAmount > 0 && order.paid) {
        const walletRef = db.collection('wallets').doc(userId);
        const walletSnap = await transaction.get(walletRef);
        const currentBalance = walletSnap.exists ? Number(walletSnap.data().balance || 0) : 0;
        const newBalance = currentBalance + refundAmount;

        transaction.update(walletRef, {
          balance: newBalance,
          email: userEmail.toLowerCase(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const historyRef = db.collection('walletHistory').doc();
        transaction.set(historyRef, {
          userId,
          userEmail: userEmail.toLowerCase(),
          type: 'order_refund',
          amount: refundAmount,
          balanceAfter: newBalance,
          ref: orderId,
          note: 'Order (cancelled) for ' + order.forDate,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      transaction.update(orderRef, {
        status: 'cancelled',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        message: 'Order cancelled successfully'
      };
    });

    if (orderData) {
      notifyAdminsInternal({
        message: formatOrderNotification({ type: 'order-cancelled', order: orderData, userEmail }),
        link: 'orders-admin',
        linkText: 'View orders',
        type: 'order-cancelled'
      }).catch(() => {});
    }

    return res.status(200).json(result);
  } catch (error) {
    const { sendErrorResponse } = await import('./error-handler.js');
    return sendErrorResponse(res, error, 'Failed to cancel order');
  }
}

async function editOrder(req, res, userId, userEmail) {
  const { orderId, items, total } = req.body;

  if (!orderId || !items || total === undefined) {
    return res.status(400).json({ error: 'Missing orderId, items, or total' });
  }

  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0 || !Number.isInteger(total)) {
    return res.status(400).json({ error: 'Invalid total: must be a positive integer' });
  }

  try {
    let orderData = null;
    const historySnap = await db.collection('walletHistory')
      .where('userId', '==', userId)
      .where('ref', '==', orderId)
      .limit(1)
      .get();

    const result = await db.runTransaction(async (transaction) => {
      const orderRef = db.collection('orders').doc(orderId);
      const orderSnap = await transaction.get(orderRef);

      if (!orderSnap.exists) {
        throw new Error('Order not found');
      }

      const order = orderSnap.data();
      orderData = order;
      if (order.userId !== userId && order.userEmail !== userEmail) {
        throw new Error('Order does not belong to this user');
      }

      const prevTotal = Number(order.total || 0);
      const diff = total - prevTotal;

      const walletRef = db.collection('wallets').doc(userId);
      const walletSnap = await transaction.get(walletRef);
      const currentBalance = walletSnap.exists ? Number(walletSnap.data().balance || 0) : 0;

      if (diff > 0 && currentBalance < diff) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      const newBalance = currentBalance - diff;

      transaction.update(orderRef, {
        items,
        total,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (diff !== 0) {
        transaction.update(walletRef, {
          balance: newBalance,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        if (!historySnap.empty) {
          const histDocRef = historySnap.docs[0].ref;
          const newDebitAmount = -total;

          transaction.update(histDocRef, {
            amount: newDebitAmount,
            balanceAfter: newBalance,
            note: 'Order (edited) for ' + order.forDate,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }

      return {
        success: true,
        newTotal: total
      };
    });

    if (orderData) {
      notifyAdminsInternal({
        message: formatOrderNotification({
          type: 'order-edited',
          order: orderData,
          userEmail,
          items,
          newTotal: total,
          prevTotal: orderData.total,
          oldItems: orderData.items
        }),
        link: 'orders-admin',
        linkText: 'View orders',
        type: 'order-edited'
      }).catch(() => {});
    }

    return res.status(200).json(result);
  } catch (error) {
    const { sendErrorResponse } = await import('./error-handler.js');
    return sendErrorResponse(res, error, 'Failed to edit order');
  }
}

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
  const { action } = req.body;

  switch (action) {
    case 'place':
      return placeOrder(req, res, userId, userEmail);
    case 'cancel':
      return cancelOrder(req, res, userId, userEmail);
    case 'edit':
      return editOrder(req, res, userId, userEmail);
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }
}
