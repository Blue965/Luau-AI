export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username } = req.query;

  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username parameter required' });
  }

  const cleanUsername = username.trim();

  if (cleanUsername.length < 3 || cleanUsername.length > 20) {
    return res.status(400).json({ error: 'Invalid username length' });
  }

  try {
    const response = await fetch(
      'https://users.roblox.com/v1/usernames/users',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usernames: [cleanUsername],
          excludeBannedUsers: true
        }),
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Roblox API error'
      });
    }

    const data = await response.json();

    const user = data?.data?.[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      id: user.id,
      name: user.name,
      displayName: user.displayName || user.name
    });

  } catch (error) {
    console.error('Roblox lookup error:', error);

    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}