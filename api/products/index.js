import clientPromise from '../lib/mongodb.js';
import { verifyToken } from '../lib/auth.js';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const client = await clientPromise;
  const db = client.db('akkis-baking');
  const products = db.collection('products');

  // GET — public (website साठी)
  if (req.method === 'GET') {
    const data = await products.find({}).sort({ createdAt: -1 }).toArray();
    return res.status(200).json(data);
  }

  // POST/PUT/DELETE — admin only
  try {
    verifyToken(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    const product = {
      ...req.body,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await products.insertOne(product);
    return res.status(201).json({ success: true, id: result.insertedId });
  }

  if (req.method === 'PUT') {
    const { id, ...data } = req.body;
    const { ObjectId } = await import('mongodb');
    await products.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...data, updatedAt: new Date() } }
    );
    return res.status(200).json({ success: true });
  }

  if (req.method === 'DELETE') {
    const { ObjectId } = await import('mongodb');
    const { id } = req.body;
    await products.deleteOne({ _id: new ObjectId(id) });
    return res.status(200).json({ success: true });
  }
}
