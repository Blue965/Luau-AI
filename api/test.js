export default async function handler(req, res) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    // Test simple avec Hugging Face
    const response = await fetch(
      'https://api-inference.huggingface.co/models/google/gemma-7b-it',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: '<start_of_turn>user\nSalut<end_of_turn>\n<start_of_turn>model',
          parameters: {
            max_new_tokens: 100,
            temperature: 0.7
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({
        error: 'API test failed',
        status: response.status,
        details: error
      });
    }

    const data = await response.json();
    res.status(200).json({
      success: true,
      message: 'API key is valid',
      reply: data[0]?.generated_text?.substring(0, 50) + '...'
    });
  } catch (error) {
    res.status(500).json({ error: 'Test failed: ' + error.message });
  }
}