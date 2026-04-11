function showUserConfirm(user) {
  document.getElementById('confirm-avatar').src = user.avatarUrl;

  document.getElementById('confirm-name').textContent =
    user.displayName + (user.displayName !== user.username ? ` (@${user.username})` : '');

  document.getElementById('confirm-id').textContent = `ID Roblox: ${user.id}`;

  document.getElementById('user-confirm').classList.add('show');
}