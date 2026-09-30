import clientPromise from '../lib/mongodb.js';
import { verifyToken } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const client = await clientPromise;
  const db = client.db('akkis-baking');
  const orders = db.collection('orders');

  // POST — new order (public)
  if (req.method === 'POST') {
    const order = {
      ...req.body,
      status: 'pending',
      createdAt: new Date()
    };
    const result = await orders.insertOne(order);
    return res.status(201).json({ success: true, id: result.insertedId });
  }

  // GET/PUT — admin only
  try {
    verifyToken(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    const data = await orders.find({}).sort({ createdAt: -1 }).toArray();
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    const { ObjectId } = await import('mongodb');
    const { id, status } = req.body;
    await orders.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } }
    );
    return res.status(200).json({ success: true });
  }
}
