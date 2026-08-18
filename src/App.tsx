/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, VolumeX, Trophy, Zap, Play, RotateCcw, HelpCircle, Info } from 'lucide-react';
import GameCanvas from './components/GameCanvas';
import { GameState, GameStats } from './types';
import { audioEngine } from './utils/AudioEngine';

export default function App() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [stats, setStats] = useState<GameStats>({
    score: 0,
    highScore: parseInt(localStorage.getItem('stack_high_score') || '0', 10),
    perfectCombo: 0,
  });
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    return localStorage.getItem('stack_is_muted') === 'true';
  });
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);

  // Synchronize mute setting
  useEffect(() => {
    localStorage.setItem('stack_is_muted', isMuted.toString());
  }, [isMuted]);

  // Support Space/Enter to skip showcase and see results
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'SHOWCASE' && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        setGameState('GAME_OVER');
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [gameState]);

  // Update game scores/combo stats from canvas
  const handleScoreUpdate = (updatedStats: GameStats) => {
    setStats(updatedStats);
  };

  const handleGameOver = (finalScore: number) => {
    setGameState('SHOWCASE');
  };

  const handleStartGame = () => {
    // We play a brief placeholder sound to activate Web Audio context on mobile/safari
    audioEngine.setMuted(isMuted);
    audioEngine.playPlace(0);
    setGameState('PLAYING');
  };

  const handleResetHighScore = () => {
    if (window.confirm('Are you sure you want to reset your high score?')) {
      localStorage.setItem('stack_high_score', '0');
      setStats((prev) => ({ ...prev, highScore: 0 }));
    }
  };

  return (
    <div id="app-root" className="w-screen h-screen bg-slate-950 flex items-center justify-center font-sans antialiased">
      {/* 
        Responsive Layout Frame:
        Simulate a gorgeous modern minimalist console/mobile boundary on desktop,
        and expand fluidly to fill 100% viewport on mobile.
      */}
      <div 
        id="game-viewport-frame"
        className="w-full h-full md:max-w-md md:max-h-[850px] md:rounded-[40px] md:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] md:border-12 md:border-slate-900 bg-white relative flex flex-col overflow-hidden"
      >
        {/* Core Game Render Canvas */}
        <GameCanvas
          gameState={gameState}
          onScoreUpdate={handleScoreUpdate}
          onGameOver={handleGameOver}
          isMuted={isMuted}
        />

        {/* --- DYNAMIC HUD OVERLAYS --- */}

        {/* Top Floating Controls */}
        <div id="hud-top-bar" className="absolute top-6 left-0 right-0 px-6 flex justify-between items-center pointer-events-none z-30">
          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Mute Controller */}
            <button
              id="btn-toggle-mute"
              onClick={() => setIsMuted(!isMuted)}
              className="w-10 h-10 rounded-full bg-white/70 backdrop-blur-md flex items-center justify-center text-slate-800 shadow-sm border border-white/20 active:scale-90 hover:bg-white transition"
              aria-label={isMuted ? 'Unmute Sound' : 'Mute Sound'}
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            {/* How to Play Controller */}
            <button
              id="btn-toggle-rules"
              onClick={() => setShowHowToPlay(!showHowToPlay)}
              className="w-10 h-10 rounded-full bg-white/70 backdrop-blur-md flex items-center justify-center text-slate-800 shadow-sm border border-white/20 active:scale-90 hover:bg-white transition"
              aria-label="How to play"
            >
              <HelpCircle size={18} />
            </button>
          </div>

          {/* Persistent Trophy High Score Display */}
          <div id="high-score-badge" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur-md text-slate-800 border border-white/20 shadow-sm font-mono text-xs font-semibold">
            <Trophy size={13} className="text-amber-500 fill-amber-400" />
            <span>BEST: {stats.highScore}</span>
          </div>
        </div>

        {/* Play-Time Score Display */}
        {gameState === 'PLAYING' && (
          <div id="hud-active-score" className="absolute top-24 left-0 right-0 flex flex-col items-center justify-center pointer-events-none z-20">
            {/* Enormous, modern score display */}
            <motion.h1
              key={stats.score}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-7xl font-display font-extrabold text-slate-800 tracking-tight"
            >
              {stats.score}
            </motion.h1>

            {/* Streak Multiplier Indicator */}
            <AnimatePresence>
              {stats.perfectCombo > 0 && (
                <motion.div
                  initial={{ scale: 0.5, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.8, opacity: 0, y: -10 }}
                  className="mt-2 flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 font-mono text-xs font-bold"
                >
                  <Zap size={12} className="fill-amber-500 text-amber-500 animate-pulse" />
                  <span>PERFECT ×{stats.perfectCombo}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* START SCREEN PANEL */}
        <AnimatePresence>
          {gameState === 'START' && (
            <motion.div
              id="screen-start"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gradient-to-b from-transparent via-white/40 to-white/95 flex flex-col justify-between p-8 z-40"
            >
              <div className="flex flex-col items-center mt-20 text-center">
                {/* Brand Logo */}
                <motion.div
                  initial={{ y: -30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="relative"
                >
                  <h1 className="text-6xl font-display font-extrabold text-slate-900 tracking-[0.15em] pl-[0.15em] select-none">
                    STACK
                  </h1>
                  <span className="text-xs font-mono tracking-[0.3em] pl-[0.3em] uppercase text-slate-500 font-semibold mt-1 block">
                    Minimalist Isometric Edition
                  </span>
                </motion.div>
              </div>

              {/* Bottom control hub */}
              <div className="flex flex-col gap-4 items-center mb-12">
                <motion.button
                  id="btn-play-game"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  onClick={handleStartGame}
                  className="w-48 py-4 bg-slate-900 text-white rounded-2xl font-display font-semibold text-lg shadow-xl hover:bg-slate-800 active:scale-95 transition flex items-center justify-center gap-2 group"
                >
                  <Play size={18} className="fill-white" />
                  <span>PLAY NOW</span>
                </motion.button>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.6 }}
                  transition={{ delay: 0.6 }}
                  className="text-xs text-slate-600 font-mono text-center max-w-[200px]"
                >
                  Tap anywhere or press Spacebar to stack blocks.
                </motion.p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SHOWCASE PANEL */}
        <AnimatePresence>
          {gameState === 'SHOWCASE' && (
            <motion.div
              id="screen-showcase"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-transparent flex flex-col justify-end p-8 z-40 cursor-pointer"
              onClick={() => setGameState('GAME_OVER')}
            >
              <div className="w-full flex justify-center pb-4 pointer-events-auto">
                <motion.button
                  id="btn-showcase-continue"
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 30, opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setGameState('GAME_OVER');
                  }}
                  className="w-full max-w-xs py-4 bg-white text-slate-900 hover:bg-slate-50 rounded-2xl font-display font-extrabold text-xs tracking-[0.15em] shadow-[0_12px_30px_rgba(0,0,0,0.35)] active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/50"
                >
                  <span>SEE RESULTS</span>
                  <span className="text-sm font-light">→</span>
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* GAME OVER SCREEN PANEL */}
        <AnimatePresence>
          {gameState === 'GAME_OVER' && (
            <motion.div
              id="screen-game-over"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-[3px] flex items-center justify-center p-6 z-40"
            >
              <motion.div
                initial={{ scale: 0.9, y: 50, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 50, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 180 }}
                className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl flex flex-col items-center border border-slate-100"
              >
                <span className="text-xs font-mono font-bold tracking-[0.25em] text-rose-500 uppercase">
                  Game Over
                </span>
                
                <h2 className="text-5xl font-display font-extrabold text-slate-900 mt-2">
                  {stats.score}
                </h2>
                
                <p className="text-sm text-slate-500 font-semibold mb-6">
                  {stats.score >= stats.highScore && stats.score > 0
                    ? '🎉 New Personal High Score!'
                    : 'Great effort! Keep going.'}
                </p>

                {/* Score Summary Metrics */}
                <div className="w-full flex justify-between gap-4 py-3 px-4 rounded-2xl bg-slate-50 border border-slate-100 mb-6 font-mono text-xs">
                  <div className="text-center flex-1">
                    <span className="text-slate-400 block mb-0.5">BEST SCORE</span>
                    <span className="text-slate-800 font-bold text-sm">{stats.highScore}</span>
                  </div>
                  <div className="w-px bg-slate-200 self-stretch" />
                  <div className="text-center flex-1">
                    <span className="text-slate-400 block mb-0.5">COMBO STREAK</span>
                    <span className="text-slate-800 font-bold text-sm">×{stats.perfectCombo}</span>
                  </div>
                </div>

                {/* Control Actions */}
                <div className="w-full flex flex-col gap-3">
                  <button
                    id="btn-retry-game"
                    onClick={handleStartGame}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-display font-semibold text-base shadow-lg hover:bg-slate-800 active:scale-[0.98] transition flex items-center justify-center gap-2"
                  >
                    <RotateCcw size={16} />
                    <span>PLAY AGAIN</span>
                  </button>

                  <div className="flex justify-between w-full mt-2">
                    <button
                      id="btn-reset-best"
                      onClick={handleResetHighScore}
                      className="text-xs text-rose-500 hover:text-rose-600 font-semibold hover:underline active:scale-95 transition"
                    >
                      Reset Best
                    </button>
                    <button
                      id="btn-back-to-menu"
                      onClick={() => setGameState('START')}
                      className="text-xs text-slate-500 hover:text-slate-700 font-semibold hover:underline active:scale-95 transition"
                    >
                      Main Menu
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* HOW TO PLAY MODAL OVERLAY */}
        <AnimatePresence>
          {showHowToPlay && (
            <motion.div
              id="modal-how-to-play"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 z-50 pointer-events-auto"
              onClick={() => setShowHowToPlay(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 30 }}
                className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-display font-bold text-slate-900 flex items-center gap-2">
                    <Info size={18} className="text-indigo-500" />
                    How to Play
                  </h3>
                  <button
                    id="btn-close-how-to-play"
                    onClick={() => setShowHowToPlay(false)}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-500 w-6 h-6 rounded-full flex items-center justify-center font-bold"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center font-mono text-xs text-slate-800 font-bold shrink-0 mt-0.5">
                      1
                    </div>
                    <p>
                      Blocks slide back and forth in 3D isometric space. Tap anywhere or press the{' '}
                      <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs font-mono text-slate-800">
                        Spacebar
                      </kbd>{' '}
                      to stack them.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center font-mono text-xs text-slate-800 font-bold shrink-0 mt-0.5">
                      2
                    </div>
                    <p>
                      If placed off-center, the overhanging part is cut off and falls down. Your block becomes smaller!
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center font-mono text-xs text-slate-800 font-bold shrink-0 mt-0.5">
                      3
                    </div>
                    <p>
                      Align blocks <strong className="text-slate-800">perfectly</strong> to get bonus scores, sparkly chime sounds, and to grow your block back after 5 perfect stacks in a row!
                    </p>
                  </div>
                </div>

                <button
                  id="btn-dismiss-how-to-play"
                  onClick={() => setShowHowToPlay(false)}
                  className="mt-6 w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-semibold text-sm transition"
                >
                  GOT IT, LET'S GO
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
