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
    // Native assets load asynchronously; do not drop the first feedback event.
    for (let attempt = 0; attempt < 10 && !player.isLoaded; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    if (!player.isLoaded) return;

    if (player.playing) player.pause();
    player.muted = false;
    player.volume = Math.min(1, Math.max(0, volume));
    await player.seekTo(0);
    player.play();
  } catch {
    // Optional feedback must never interrupt the operation that triggered it.
  }
}
