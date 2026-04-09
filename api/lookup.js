export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: 'Username parameter required' });
  }

  try {
    // Roblox API to lookup user by username
    const response = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        usernames: [username],
      }),
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Roblox API error' });
    }

    const data = await response.json();

    // Return the user data
    if (data.data && data.data.length > 0) {
      const user = data.data[0];
      res.status(200).json({
        id: user.id,
        name: user.name,
        displayName: user.displayName,
      });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error fetching from Roblox API:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}