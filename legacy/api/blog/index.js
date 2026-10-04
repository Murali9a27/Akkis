import clientPromise from '../lib/mongodb.js';
import { verifyToken } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const client = await clientPromise;
  const db = client.db('akkis-baking');
  const blog = db.collection('blog');

  if (req.method === 'GET') {
    const data = await blog.find({}).sort({ createdAt: -1 }).toArray();
    return res.status(200).json(data);
  }

  try { verifyToken(req); } 
  catch { return res.status(401).json({ error: 'Unauthorized' }); }

  if (req.method === 'POST') {
    const post = { ...req.body, createdAt: new Date() };
    const result = await blog.insertOne(post);
    return res.status(201).json({ success: true, id: result.insertedId });
  }

  if (req.method === 'PUT') {
    const { ObjectId } = await import('mongodb');
    const { id, ...data } = req.body;
    await blog.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...data, updatedAt: new Date() } }
    );
    return res.status(200).json({ success: true });
  }

  if (req.method === 'DELETE') {
    const { ObjectId } = await import('mongodb');
    const { id } = req.body;
    await blog.deleteOne({ _id: new ObjectId(id) });
    return res.status(200).json({ success: true });
  }
}
