function showUserConfirm(user) {
  const el = document.getElementById('user-confirm');
  if (!el) return;

  document.getElementById('confirm-avatar').src = user.avatarUrl;
  document.getElementById('confirm-name').textContent =
    user.displayName + (user.displayName !== user.username ? ` (@${user.username})` : '');

  document.getElementById('confirm-id').textContent = 'ID Roblox: ' + user.id;

  el.classList.add('show');
}