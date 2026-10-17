import { avatarTone, initialsFor } from "./peopleUtils";

/** Initials avatar (or uploaded image) used across People and Teams. */
export function PersonAvatar({
  userId,
  name,
  email,
  image,
  size = 32,
}: {
  userId: string;
  name: string;
  email?: string;
  image?: string | null;
  size?: number;
}) {
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.round(size * 0.38)),
    background: avatarTone(userId),
  };
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="people-avatar" src={image} alt="" style={style} />
    );
  }
  return (
    <span className="people-avatar" style={style} aria-hidden="true">
      {initialsFor(name, email)}
    </span>
  );
}

/** Overlapping avatar stack with a "+N" overflow chip. */
export function AvatarStack({
  people,
  max = 5,
  size = 24,
}: {
  people: { userId: string; name: string; email?: string; image?: string | null }[];
  max?: number;
  size?: number;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="people-avatar-stack" aria-label={`${people.length} members`}>
      {shown.map((person) => (
        <span key={person.userId} title={person.name}>
          <PersonAvatar {...person} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span className="people-avatar people-avatar-more" style={{ width: size, height: size }}>
          +{extra}
        </span>
      )}
    </span>
  );
}
