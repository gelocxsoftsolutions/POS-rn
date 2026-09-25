import type { AudioPlayer } from "expo-audio";

interface FeedbackSoundOptions {
  muted: boolean;
  volume: number;
}

export async function playFeedbackSound(
  player: AudioPlayer,
  { muted, volume }: FeedbackSoundOptions
): Promise<void> {
  if (muted || volume <= 0) return;

  try {
    player.muted = false;
    player.volume = Math.min(1, Math.max(0, volume));
    await player.seekTo(0);
    player.play();
  } catch {
    // Optional feedback must never interrupt the operation that triggered it.
  }
}
