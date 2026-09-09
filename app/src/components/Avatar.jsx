// A member at a glance: uploaded photo or emoji avatar, ringed in their table
// color when one is known. `color` is a hex string (from vm_colors) or null.
export default function Avatar({ profile, size = 40, color = null, online = false }) {
  const style = {
    width: size,
    height: size,
    fontSize: size * 0.52,
    boxShadow: color ? `0 0 0 3px ${color}` : undefined,
  };
  return (
    <span className="va-avatar" style={style} title={profile?.display_name || ''}>
      {profile?.photo_url ? (
        <img src={profile.photo_url} alt="" />
      ) : (
        <span aria-hidden="true">{profile?.avatar || '🙂'}</span>
      )}
      {online && <span className="va-avatar-online" aria-label="online" />}
    </span>
  );
}
