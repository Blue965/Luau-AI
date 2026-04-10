export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array required' });
  }

  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    console.error('HUGGINGFACE_API_KEY not found');
    return res.status(500).json({ error: 'API key not configured' });
  }

  console.log('=== DEBUG API CALL ===');
  console.log('Received messages:', JSON.stringify(messages, null, 2));
  console.log('API Key exists:', !!apiKey);
  console.log('API Key starts with:', apiKey.substring(0, 10) + '...');

  try {
    // Construire le prompt pour Gemma
    const conversationText = messages
      .map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.text}`)
      .join('\n');

    const fullPrompt = `<start_of_turn>system
Tu es Luau AI, un assistant IA expert en scripting Roblox avec le langage Luau. Tu aides les utilisateurs à créer des scripts, déboguer du code, optimiser les performances et fournir des conseils sur le développement Roblox. Réponds toujours en français de manière claire et utile. Fournis des exemples de code précis et fonctionnels.
<end_of_turn>

<start_of_turn>user
${conversationText}
<end_of_turn>

<start_of_turn>model`;

    console.log('Full prompt to send:', fullPrompt);

    const response = await fetch(
      `https://api-inference.huggingface.co/models/google/gemma-7b-it`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: fullPrompt,
          parameters: {
            max_new_tokens: 2000,
            temperature: 0.7,
            do_sample: true,
            return_full_text: false
          }
        })
      }
    );

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('=== API ERROR ===');
      console.error('Status:', response.status);
      console.error('Status Text:', response.statusText);
      console.error('Response Body:', errorText);
      console.error('================');
      return res.status(response.status).json({
        error: `AI service error: ${response.status} - ${errorText}`
      });
    }

    const data = await response.json();
    console.log('Success response:', JSON.stringify(data, null, 2));

    // Pour Hugging Face, la réponse est dans generated_text
    const reply = data[0]?.generated_text || data.generated_text;

    if (!reply) {
      console.error('No reply in response');
      return res.status(500).json({ error: 'No response from AI' });
    }

    console.log('Final reply:', reply ? reply.substring(0, 100) + '...' : 'undefined');
    res.status(200).json({ reply });
  } catch (error) {
    console.error('Error calling Hugging Face:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}