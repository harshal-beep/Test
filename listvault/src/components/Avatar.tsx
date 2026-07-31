import { Profile } from '../lib/types'

export default function Avatar({ profile, size = 7 }: { profile?: Profile | null; size?: number }) {
  const initial = (profile?.display_name || '?').trim().charAt(0).toUpperCase()
  const px = size * 4
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={profile.display_name}
        referrerPolicy="no-referrer"
        style={{ width: px, height: px }}
        className="rounded-full object-cover"
      />
    )
  }
  return (
    <span
      style={{ width: px, height: px }}
      className="flex items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white"
    >
      {initial}
    </span>
  )
}
