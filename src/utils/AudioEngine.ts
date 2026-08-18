/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class AudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    // Lazy initialize on first interaction
  }

  private init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (!muted) {
      this.init();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Sound when a block is successfully placed (normal stack)
   * The pitch rises as the score/height increases!
   */
  public playPlace(score: number) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    // Calculate frequency based on score (pentatonic scale for pleasant melody)
    const baseFreq = 261.63; // C4
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // C major pentatonic
    const noteIndex = score % scale.length;
    const octave = Math.floor(score / scale.length);
    const semitones = scale[noteIndex] + octave * 12;
    const freq = baseFreq * Math.pow(2, semitones / 12);

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    gainNode.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.35);
  }

  /**
   * Sound when a perfect overlap is scored.
   * Plays a higher-pitched pure sine tone with an echo vibe.
   */
  public playPerfect(combo: number) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    // Rising pitch based on combo streak
    const baseFreq = 523.25; // C5
    const semitoneShift = combo * 2; // Move up 2 semitones per combo
    const freq = baseFreq * Math.pow(2, semitoneShift / 12);

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    // Fade in/out for a clean bell-like sound
    gainNode.gain.setValueAtTime(0.001, this.ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);

    // Play a secondary echo effect for that "perfect chime" feeling
    setTimeout(() => {
      if (this.isMuted || !this.ctx) return;
      const echoOsc = this.ctx.createOscillator();
      const echoGain = this.ctx.createGain();

      echoOsc.type = 'sine';
      echoOsc.frequency.setValueAtTime(freq * 1.5, this.ctx.currentTime); // Perfect fifth fifth note echo

      echoGain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      echoGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

      echoOsc.connect(echoGain);
      echoGain.connect(this.ctx.destination);

      echoOsc.start();
      echoOsc.stop(this.ctx.currentTime + 0.3);
    }, 120);
  }

  /**
   * Sound when slice is cut off. Plays a quick click-like click.
   */
  public playSlice() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.08);

    gainNode.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  /**
   * Sound played on Game Over.
   * A clean minor-chord-like fall in pitch.
   */
  public playGameOver() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const baseFreq = 180; // G3 flat / slightly dissonant
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
    osc1.frequency.linearRampToValueAtTime(baseFreq * 0.5, this.ctx.currentTime + 0.8);

    osc2.frequency.setValueAtTime(baseFreq * 1.2, this.ctx.currentTime); // Dissonant minor second
    osc2.frequency.linearRampToValueAtTime(baseFreq * 0.6, this.ctx.currentTime + 0.8);

    gainNode.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(this.ctx.currentTime + 0.8);
    osc2.stop(this.ctx.currentTime + 0.8);
  }
}

export const audioEngine = new AudioEngine();
