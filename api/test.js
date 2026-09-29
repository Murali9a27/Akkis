export default function handler(req, res) {
  res.status(200).json({ 
    message: "Akki's Baking API Working! 🎂",
    timestamp: new Date().toISOString()
  });
}
