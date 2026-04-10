export default async function handler(req, res) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    // Test simple call
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'API key invalid or no credits' });
    }

    res.status(200).json({ success: true, message: 'API key is valid' });
  } catch (error) {
    res.status(500).json({ error: 'Test failed: ' + error.message });
  }
}