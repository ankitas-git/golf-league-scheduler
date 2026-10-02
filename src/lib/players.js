// The synthetic email Base44 used as the player key. Kept so imported data still lines up.
export function playerKey(playerName) {
  return playerName.toLowerCase().replace(/\s+/g, '.') + '@player.local';
}
