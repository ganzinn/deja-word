/**
 * 正誤の効果音（Web Audio API でオンザフライ生成）。
 * 音声アセットを持たず Blob driver にも依存しないため、ローカル開発でもそのまま鳴る。
 * 回答クリックはユーザージェスチャなので、その延長で AudioContext を生成・resume できる。
 * 取得・再生に失敗しても進行に影響させない（握りつぶす）。
 */

/** モジュール内で共有する AudioContext（遅延生成。SSR / 非対応環境では null）。 */
let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (sharedContext === null) sharedContext = new Ctor();
  // タブ復帰などで suspended のままだと鳴らないため、ユーザー操作の延長で resume を試みる
  if (sharedContext.state === "suspended") void sharedContext.resume().catch(() => {});
  return sharedContext;
}

/** 1 音を矩形/正弦波で鳴らす。エンベロープでアタック/リリースを付けプチノイズを抑える。 */
function playTone(
  ctx: AudioContext,
  startAt: number,
  freq: number,
  durationSeconds: number,
  type: OscillatorType,
  peakGain: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  const attack = 0.008;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(peakGain, startAt + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSeconds);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationSeconds + 0.02);
}

/**
 * 正誤の効果音を鳴らす。
 * correct: 上昇 2 音（A5→E6）の心地よいチャイム / incorrect: 低めのブザー。
 */
export function playAnswerSound(kind: "correct" | "incorrect"): void {
  const ctx = getContext();
  if (ctx === null) return;
  try {
    const now = ctx.currentTime;
    if (kind === "correct") {
      playTone(ctx, now, 880, 0.12, "sine", 0.18); // A5
      playTone(ctx, now + 0.1, 1318.5, 0.16, "sine", 0.18); // E6
    } else {
      playTone(ctx, now, 196, 0.26, "square", 0.12); // 低めのブザー（G3）
    }
  } catch {
    // 再生失敗は無視
  }
}
