/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { GameState, Block, FallingSlice, Particle, GameStats } from '../types';
import { audioEngine } from '../utils/AudioEngine';

interface GameCanvasProps {
  gameState: GameState;
  onScoreUpdate: (stats: GameStats) => void;
  onGameOver: (score: number) => void;
  isMuted: boolean;
}

const BLOCK_HEIGHT = 40;
const MAX_SIZE = 80;
const MOVEMENT_RANGE = 180;
const PERFECT_THRESHOLD = 3.5; // pixel tolerance for perfect landing

export default function GameCanvas({
  gameState,
  onScoreUpdate,
  onGameOver,
  isMuted,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Core Game State Refs to avoid closure-binding issues in the requestAnimationFrame loop
  const stateRef = useRef<{
    gameState: GameState;
    blocks: Block[];
    activeBlock: {
      x: number;
      z: number;
      width: number;
      depth: number;
      direction: number; // 1 or -1
      axis: 'X' | 'Z';
    } | null;
    fallingSlices: FallingSlice[];
    particles: Particle[];
    cameraY: number;
    targetCameraY: number;
    cameraZoom: number;
    score: number;
    perfectCombo: number;
    highScore: number;
    baseHue: number; // current starting hue
    hueStep: number;
    perfectRipples: { x: number; y: number; z: number; size: number; alpha: number; maxZ: number }[];
  }>({
    gameState: 'START',
    blocks: [],
    activeBlock: null,
    fallingSlices: [],
    particles: [],
    cameraY: 0,
    targetCameraY: 0,
    cameraZoom: 1.8,
    score: 0,
    perfectCombo: 0,
    highScore: parseInt(localStorage.getItem('stack_high_score') || '0', 10),
    baseHue: Math.floor(Math.random() * 360),
    hueStep: 4,
    perfectRipples: [],
  });

  // Track dimensions
  const [dimensions, setDimensions] = useState({ width: 400, height: 600 });

  // Update audio state
  useEffect(() => {
    audioEngine.setMuted(isMuted);
  }, [isMuted]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize/Reset Game on State Change
  useEffect(() => {
    stateRef.current.gameState = gameState;

    if (gameState === 'PLAYING') {
      const startHue = Math.floor(Math.random() * 360);
      
      // Setup initial blocks (foundation)
      const baseBlock: Block = {
        id: 'foundation',
        x: 0,
        y: 0,
        z: 0,
        width: MAX_SIZE,
        depth: MAX_SIZE,
        height: BLOCK_HEIGHT,
        color: `hsl(${startHue}, 85%, 60%)`,
        hue: startHue,
      };

      stateRef.current.blocks = [baseBlock];
      stateRef.current.fallingSlices = [];
      stateRef.current.particles = [];
      stateRef.current.perfectRipples = [];
      stateRef.current.score = 0;
      stateRef.current.perfectCombo = 0;
      stateRef.current.baseHue = startHue;
      stateRef.current.cameraY = 0;
      stateRef.current.targetCameraY = 0;
      stateRef.current.cameraZoom = 1.8;

      // Spawn first moving block
      spawnNextBlock();

      onScoreUpdate({
        score: 0,
        highScore: stateRef.current.highScore,
        perfectCombo: 0,
      });
    } else if (gameState === 'SHOWCASE') {
      // Set camera target Y to the middle of the tower to center it beautifully!
      const towerHeight = stateRef.current.blocks.reduce((sum, b) => sum + b.height, 0);
      stateRef.current.targetCameraY = Math.max(160, towerHeight / 2 - 80);
    } else if (gameState === 'START') {
      // Create a nice static background stack for the main menu
      const startHue = Math.floor(Math.random() * 360);
      const tempBlocks: Block[] = [];
      
      // Draw a solid foundation pyramid for main menu
      let currentY = 0;
      for (let i = 0; i < 8; i++) {
        const size = MAX_SIZE - i * 8;
        tempBlocks.push({
          id: `menu-${i}`,
          x: 0,
          y: currentY,
          z: 0,
          width: size,
          depth: size,
          height: size, // Look like perfect cubes!
          color: `hsl(${(startHue + i * 5) % 360}, 85%, ${60 - i * 1.5}%)`,
          hue: (startHue + i * 5) % 360,
        });
        currentY += size;
      }
      stateRef.current.blocks = tempBlocks;
      stateRef.current.activeBlock = null;
      stateRef.current.fallingSlices = [];
      stateRef.current.particles = [];
      stateRef.current.perfectRipples = [];
      stateRef.current.cameraY = currentY / 2;
      stateRef.current.targetCameraY = currentY / 2;
    }
  }, [gameState]);

  // Helper: Spawn the next active block sitting on top of the stack
  const spawnNextBlock = () => {
    const { blocks, score, baseHue, hueStep } = stateRef.current;
    const topBlock = blocks[blocks.length - 1];
    
    const nextLevel = blocks.length;
    const nextHue = (baseHue + nextLevel * hueStep) % 360;
    
    // Switch moving axis
    const axis = nextLevel % 2 === 0 ? 'X' : 'Z';
    
    // Spawn block far away on the designated axis
    // If moving on X, z is fixed. If moving on Z, x is fixed.
    stateRef.current.activeBlock = {
      x: axis === 'X' ? -MOVEMENT_RANGE : topBlock.x,
      z: axis === 'Z' ? -MOVEMENT_RANGE : topBlock.z,
      width: topBlock.width,
      depth: topBlock.depth,
      direction: 1,
      axis,
    };

    // Set camera target Y to track the top of the stack smoothly
    stateRef.current.targetCameraY = topBlock.y + topBlock.height;
  };

  // Trigger Stack Action
  const performStack = () => {
    const { gameState: currentStatus, blocks, activeBlock, score, perfectCombo, highScore } = stateRef.current;
    if (currentStatus !== 'PLAYING' || !activeBlock) return;

    const topBlock = blocks[blocks.length - 1];
    const nextLevel = blocks.length;
    const nextHue = (stateRef.current.baseHue + nextLevel * stateRef.current.hueStep) % 360;

    let isMatch = false;
    let perfect = false;

    const targetY = topBlock.y + topBlock.height;

    if (activeBlock.axis === 'X') {
      const diff = activeBlock.x - topBlock.x;
      const tolerance = PERFECT_THRESHOLD;

      if (Math.abs(diff) < tolerance) {
        // --- PERFECT STACK ---
        perfect = true;
        isMatch = true;
        
        // Snap perfectly to center
        activeBlock.x = topBlock.x;
        const newCombo = perfectCombo + 1;
        stateRef.current.perfectCombo = newCombo;
        audioEngine.playPerfect(newCombo);

        // Visual Perfect Ripple effect
        stateRef.current.perfectRipples.push({
          x: activeBlock.x,
          y: targetY,
          z: activeBlock.z,
          size: 1,
          alpha: 1,
          maxZ: Math.max(activeBlock.width, activeBlock.depth) * 1.5,
        });

        // Perfect streak logic: Grow block size if combo gets high!
        let finalWidth = activeBlock.width;
        let finalDepth = activeBlock.depth;
        let finalX = activeBlock.x;
        if (newCombo >= 5) {
          // X axis active: only increase size in X direction of movement (width)
          finalWidth = Math.min(activeBlock.width + 8, MAX_SIZE);
          const dw = finalWidth - activeBlock.width;
          if (dw > 0) {
            if (activeBlock.direction > 0) {
              // Moving left to right (positive X) -> expand right (shift center positive X)
              finalX = activeBlock.x + dw / 2;
            } else {
              // Moving right to left (negative X) -> expand left (shift center negative X)
              finalX = activeBlock.x - dw / 2;
            }
          }
        }

        const newBlock: Block = {
          id: `block-${nextLevel}`,
          x: finalX,
          y: targetY,
          z: activeBlock.z,
          width: finalWidth,
          depth: finalDepth,
          height: BLOCK_HEIGHT,
          color: `hsl(${nextHue}, 85%, 60%)`,
          hue: nextHue,
        };

        stateRef.current.blocks.push(newBlock);
        spawnParticles(newBlock.x, newBlock.y + newBlock.height, newBlock.z, newBlock.width, newBlock.depth, nextHue);
      } else if (Math.abs(diff) < topBlock.width) {
        // --- PARTIAL OVERLAP (CUT BLOCK) ---
        isMatch = true;
        stateRef.current.perfectCombo = 0;
        audioEngine.playPlace(score + 1);
        audioEngine.playSlice();

        const overlapWidth = topBlock.width - Math.abs(diff);
        const overlapX = topBlock.x + diff / 2;

        const newBlock: Block = {
          id: `block-${nextLevel}`,
          x: overlapX,
          y: targetY,
          z: activeBlock.z,
          width: overlapWidth,
          depth: activeBlock.depth,
          height: BLOCK_HEIGHT,
          color: `hsl(${nextHue}, 85%, 60%)`,
          hue: nextHue,
        };

        stateRef.current.blocks.push(newBlock);

        // Spawn falling slice debris
        const sliceWidth = Math.abs(diff);
        const sliceX = diff > 0 
          ? (overlapX + overlapWidth / 2 + sliceWidth / 2)
          : (overlapX - overlapWidth / 2 - sliceWidth / 2);

        spawnDebris(
          sliceX,
          targetY,
          activeBlock.z,
          sliceWidth,
          activeBlock.depth,
          topBlock.height,
          nextHue,
          diff > 0 ? 1.5 : -1.5,
          0
        );
      }
    } else {
      // Axis === 'Z'
      const diff = activeBlock.z - topBlock.z;
      const tolerance = PERFECT_THRESHOLD;

      if (Math.abs(diff) < tolerance) {
        // --- PERFECT STACK ---
        perfect = true;
        isMatch = true;
        
        activeBlock.z = topBlock.z;
        const newCombo = perfectCombo + 1;
        stateRef.current.perfectCombo = newCombo;
        audioEngine.playPerfect(newCombo);

        // Ripple
        stateRef.current.perfectRipples.push({
          x: activeBlock.x,
          y: targetY,
          z: activeBlock.z,
          size: 1,
          alpha: 1,
          maxZ: Math.max(activeBlock.width, activeBlock.depth) * 1.5,
        });

        let finalWidth = activeBlock.width;
        let finalDepth = activeBlock.depth;
        let finalZ = activeBlock.z;
        if (newCombo >= 5) {
          // Z axis active: only increase size in Z direction of movement (depth)
          finalDepth = Math.min(activeBlock.depth + 8, MAX_SIZE);
          const dd = finalDepth - activeBlock.depth;
          if (dd > 0) {
            if (activeBlock.direction > 0) {
              // Moving in positive Z direction -> expand in positive Z (shift center positive Z)
              finalZ = activeBlock.z + dd / 2;
            } else {
              // Moving in negative Z direction -> expand in negative Z (shift center negative Z)
              finalZ = activeBlock.z - dd / 2;
            }
          }
        }

        const newBlock: Block = {
          id: `block-${nextLevel}`,
          x: activeBlock.x,
          y: targetY,
          z: finalZ,
          width: finalWidth,
          depth: finalDepth,
          height: BLOCK_HEIGHT,
          color: `hsl(${nextHue}, 85%, 60%)`,
          hue: nextHue,
        };

        stateRef.current.blocks.push(newBlock);
        spawnParticles(newBlock.x, newBlock.y + newBlock.height, newBlock.z, newBlock.width, newBlock.depth, nextHue);
      } else if (Math.abs(diff) < topBlock.depth) {
        // --- PARTIAL OVERLAP ---
        isMatch = true;
        stateRef.current.perfectCombo = 0;
        audioEngine.playPlace(score + 1);
        audioEngine.playSlice();

        const overlapDepth = topBlock.depth - Math.abs(diff);
        const overlapZ = topBlock.z + diff / 2;

        const newBlock: Block = {
          id: `block-${nextLevel}`,
          x: activeBlock.x,
          y: targetY,
          z: overlapZ,
          width: activeBlock.width,
          depth: overlapDepth,
          height: BLOCK_HEIGHT,
          color: `hsl(${nextHue}, 85%, 60%)`,
          hue: nextHue,
        };

        stateRef.current.blocks.push(newBlock);

        // Spawn falling slice debris
        const sliceDepth = Math.abs(diff);
        const sliceZ = diff > 0
          ? (overlapZ + overlapDepth / 2 + sliceDepth / 2)
          : (overlapZ - overlapDepth / 2 - sliceDepth / 2);

        spawnDebris(
          activeBlock.x,
          targetY,
          sliceZ,
          activeBlock.width,
          sliceDepth,
          topBlock.height,
          nextHue,
          0,
          diff > 0 ? 1.5 : -1.5
        );
      }
    }

    if (isMatch) {
      // Successfully stacked a block!
      const newScore = score + 1;
      stateRef.current.score = newScore;
      
      let finalHighScore = highScore;
      if (newScore > highScore) {
        finalHighScore = newScore;
        stateRef.current.highScore = newScore;
        localStorage.setItem('stack_high_score', newScore.toString());
      }

      onScoreUpdate({
        score: newScore,
        highScore: finalHighScore,
        perfectCombo: stateRef.current.perfectCombo,
      });

      spawnNextBlock();
    } else {
      // --- ZERO OVERLAP (GAME OVER) ---
      audioEngine.playGameOver();
      
      // Make active block fall as entire debris slice
      spawnDebris(
        activeBlock.x,
        targetY,
        activeBlock.z,
        activeBlock.width,
        activeBlock.depth,
        topBlock.height,
        nextHue,
        activeBlock.axis === 'X' ? (activeBlock.direction * 2) : 0,
        activeBlock.axis === 'Z' ? (activeBlock.direction * 2) : 0
      );

      stateRef.current.activeBlock = null;
      stateRef.current.gameState = 'GAME_OVER';
      onGameOver(score);
    }
  };

  // Spawn dynamic debris
  const spawnDebris = (
    x: number, y: number, z: number,
    w: number, d: number, h: number,
    hue: number, vx: number, vz: number
  ) => {
    stateRef.current.fallingSlices.push({
      id: Math.random().toString(),
      x, y, z,
      width: w, depth: d, height: h,
      color: `hsl(${hue}, 85%, 55%)`,
      vx, vy: 1.5, vz, // slight upward toss before falling
      gravity: -0.22,
      rx: 0, ry: 0, rz: 0,
      vrx: (Math.random() - 0.5) * 0.15,
      vry: (Math.random() - 0.5) * 0.15,
      vrz: (Math.random() - 0.5) * 0.15,
    });
  };

  // Spawn sparkles on perfect alignment
  const spawnParticles = (bx: number, by: number, bz: number, bw: number, bd: number, hue: number) => {
    const numParticles = 24;
    const color = `hsl(${hue}, 100%, 75%)`;
    
    for (let i = 0; i < numParticles; i++) {
      // Place particle along the edges of the block
      const angle = Math.random() * Math.PI * 2;
      const distPercent = 0.8 + Math.random() * 0.3;
      const px = bx + Math.cos(angle) * (bw / 2) * distPercent;
      const pz = bz + Math.sin(angle) * (bd / 2) * distPercent;

      const speed = 1.0 + Math.random() * 1.5;
      
      stateRef.current.particles.push({
        id: Math.random().toString(),
        x: px,
        y: by,
        z: pz,
        vx: Math.cos(angle) * speed,
        vy: 2.0 + Math.random() * 2.5, // push upwards
        vz: Math.sin(angle) * speed,
        color,
        size: 3 + Math.random() * 3,
        alpha: 1,
        life: 0,
        maxLife: 35 + Math.floor(Math.random() * 20),
      });
    }
  };

  // Main Canvas Rendering Loop
  useEffect(() => {
    let animationFrameId: number;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const clouds = [
      { baseX: -15, y: 10, scale: 1.4, speed: 0.024 },
      { baseX: 12, y: 18, scale: 2.2, speed: 0.016 },
      { baseX: 35, y: 8, scale: 1.2, speed: 0.028 },
      { baseX: 55, y: 24, scale: 2.8, speed: 0.012 },
      { baseX: 78, y: 14, scale: 1.7, speed: 0.022 },
      { baseX: 98, y: 28, scale: 2.3, speed: 0.015 },
      { baseX: -40, y: 22, scale: 1.9, speed: 0.019 },
    ];

    // Projection calculation: maps 3D vector -> 2D screen coordinate
    const projectVec = (x: number, y: number, z: number, cWidth: number, cHeight: number, camY: number, zoom: number) => {
      const angle = 30 * Math.PI / 180;
      const cos30 = Math.cos(angle);
      const sin30 = Math.sin(angle);

      // Horizontally center, adjust vertical offset
      const screenX = (cWidth / 2) + (x - z) * cos30 * zoom;
      const screenY = (cHeight * 0.65) + ((x + z) * sin30 - y) * zoom + camY * zoom;

      return { x: screenX, y: screenY };
    };

    // Draw solid 3D cuboid using isometric faces
    const drawBuildingBlock = (
      x: number, y: number, z: number,
      w: number, h: number, d: number,
      baseHue: number, cWidth: number, cHeight: number,
      camY: number, zoom: number, opacity: number = 1,
      isFoundation: boolean = false,
      isRoof: boolean = false,
      isMoving: boolean = false,
      levelIndex: number = 1,
      drawDecorationsOnly: boolean | 'back' | 'front' = false
    ) => {
      const v0 = projectVec(x - w/2, y + h, z - d/2, cWidth, cHeight, camY, zoom);
      const v1 = projectVec(x + w/2, y + h, z - d/2, cWidth, cHeight, camY, zoom);
      const v2 = projectVec(x + w/2, y + h, z + d/2, cWidth, cHeight, camY, zoom);
      const v3 = projectVec(x - w/2, y + h, z + d/2, cWidth, cHeight, camY, zoom);

      const v4 = projectVec(x - w/2, y, z - d/2, cWidth, cHeight, camY, zoom);
      const v5 = projectVec(x + w/2, y, z - d/2, cWidth, cHeight, camY, zoom);
      const v6 = projectVec(x + w/2, y, z + d/2, cWidth, cHeight, camY, zoom);
      const v7 = projectVec(x - w/2, y, z + d/2, cWidth, cHeight, camY, zoom);

      ctx.save();

      const blocks = stateRef.current.blocks;
      const above = (!isMoving && levelIndex >= 0 && levelIndex + 1 < blocks.length) ? blocks[levelIndex + 1] : null;

      // Helper to find the highest supporting surface Y below a point (cx, cz)
      const findSupportY = (cx: number, cz: number, currentLevel: number) => {
        for (let j = currentLevel - 1; j >= 0; j--) {
          const b = blocks[j];
          if (!b) continue;
          const margin = 0.5;
          if (cx >= (b.x - b.width/2 - margin) && cx <= (b.x + b.width/2 + margin)) {
            if (cz >= (b.z - b.depth/2 - margin) && cz <= (b.z + b.depth/2 + margin)) {
              return b.y + b.height;
            }
          }
        }
        return -60; // Water level
      };

      // Helper to draw a dual-pole ladder stilt truss at (cx, cz) from y1 to y2
      const drawScaffoldingStilt = (cx: number, cz: number, y1: number, y2: number) => {
        ctx.save();
        ctx.strokeStyle = `rgba(30, 35, 43, ${opacity})`;
        ctx.lineWidth = 1.6;
        
        // Main pole
        const top = projectVec(cx, y1, cz, cWidth, cHeight, camY, zoom);
        const bot = projectVec(cx, y2, cz, cWidth, cHeight, camY, zoom);
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bot.x, bot.y);
        ctx.stroke();

        // Parallel secondary pole
        const offsetScale = 1.6;
        const top2 = projectVec(cx + offsetScale, y1, cz + offsetScale, cWidth, cHeight, camY, zoom);
        const bot2 = projectVec(cx + offsetScale, y2, cz + offsetScale, cWidth, cHeight, camY, zoom);
        
        ctx.strokeStyle = `rgba(45, 52, 64, ${0.85 * opacity})`;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(top2.x, top2.y);
        ctx.lineTo(bot2.x, bot2.y);
        ctx.stroke();

        // Draw horizontal rungs
        ctx.strokeStyle = `rgba(30, 35, 43, ${0.75 * opacity})`;
        ctx.lineWidth = 0.8;
        const numRungs = Math.floor((y1 - y2) / 6);
        for (let r = 0; r <= numRungs; r++) {
          const f = numRungs > 0 ? r / numRungs : 0.5;
          const ry = y2 + f * (y1 - y2);
          const pA = projectVec(cx, ry, cz, cWidth, cHeight, camY, zoom);
          const pB = projectVec(cx + offsetScale, ry, cz + offsetScale, cWidth, cHeight, camY, zoom);
          ctx.beginPath();
          ctx.moveTo(pA.x, pA.y);
          ctx.lineTo(pB.x, pB.y);
          ctx.stroke();
        }
        ctx.restore();
      };

      // Helper to draw a beautiful 3D support pillar under overhanging parts
      const drawSupportPillar = (cx: number, cz: number, y1: number, y2: number, hue: number) => {
        const pw = 5;
        const pd = 5;

        // Top face points
        const pt0 = projectVec(cx - pw/2, y1, cz - pd/2, cWidth, cHeight, camY, zoom);
        const pt1 = projectVec(cx + pw/2, y1, cz - pd/2, cWidth, cHeight, camY, zoom);
        const pt2 = projectVec(cx + pw/2, y1, cz + pd/2, cWidth, cHeight, camY, zoom);
        const pt3 = projectVec(cx - pw/2, y1, cz + pd/2, cWidth, cHeight, camY, zoom);

        // Bottom face points
        const pb0 = projectVec(cx - pw/2, y2, cz - pd/2, cWidth, cHeight, camY, zoom);
        const pb1 = projectVec(cx + pw/2, y2, cz - pd/2, cWidth, cHeight, camY, zoom);
        const pb2 = projectVec(cx + pw/2, y2, cz + pd/2, cWidth, cHeight, camY, zoom);
        const pb3 = projectVec(cx - pw/2, y2, cz + pd/2, cWidth, cHeight, camY, zoom);

        ctx.save();

        const pillarHue = hue;
        const pillarSat = 35;
        const pillarLightLeft = 55;
        const pillarLightRight = 44;

        // Left Face (pt3 -> pt2 -> pb2 -> pb3)
        ctx.fillStyle = `hsla(${pillarHue}, ${pillarSat}%, ${pillarLightLeft}%, ${opacity})`;
        ctx.beginPath();
        ctx.moveTo(pt3.x, pt3.y);
        ctx.lineTo(pt2.x, pt2.y);
        ctx.lineTo(pb2.x, pb2.y);
        ctx.lineTo(pb3.x, pb3.y);
        ctx.closePath();
        ctx.fill();

        // Right Face (pt2 -> pt1 -> pb1 -> pb2)
        ctx.fillStyle = `hsla(${pillarHue}, ${pillarSat}%, ${pillarLightRight}%, ${opacity})`;
        ctx.beginPath();
        ctx.moveTo(pt2.x, pt2.y);
        ctx.lineTo(pt1.x, pt1.y);
        ctx.lineTo(pb1.x, pb1.y);
        ctx.lineTo(pb2.x, pb2.y);
        ctx.closePath();
        ctx.fill();

        // Horizontal band lines for a stone pillar aesthetic
        ctx.strokeStyle = `rgba(32, 38, 46, ${0.4 * opacity})`;
        ctx.lineWidth = 1.0;
        const numBands = Math.floor((y1 - y2) / 8);
        for (let b = 1; b <= numBands; b++) {
          const f = b / (numBands + 1);
          const py = y2 + f * (y1 - y2);
          const pL_l = projectVec(cx - pw/2, py, cz + pd/2, cWidth, cHeight, camY, zoom);
          const pL_c = projectVec(cx + pw/2, py, cz + pd/2, cWidth, cHeight, camY, zoom);
          const pL_r = projectVec(cx + pw/2, py, cz - pd/2, cWidth, cHeight, camY, zoom);

          ctx.beginPath();
          ctx.moveTo(pL_l.x, pL_l.y);
          ctx.lineTo(pL_c.x, pL_c.y);
          ctx.lineTo(pL_r.x, pL_r.y);
          ctx.stroke();
        }

        // Ink outline overlays
        ctx.strokeStyle = `rgba(32, 38, 46, ${0.5 * opacity})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(pb3.x, pb3.y);
        ctx.lineTo(pt3.x, pt3.y);
        ctx.lineTo(pt2.x, pt2.y);
        ctx.lineTo(pb2.x, pb2.y);
        ctx.closePath();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(pb2.x, pb2.y);
        ctx.lineTo(pt2.x, pt2.y);
        ctx.lineTo(pt1.x, pt1.y);
        ctx.lineTo(pb1.x, pb1.y);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
      };

      // Helper to draw watercolor brick texture on a face quad
      const drawBrickTexture = (
        p0: { x: number; y: number },
        p1: { x: number; y: number },
        p2: { x: number; y: number },
        p3: { x: number; y: number },
        isRightFace: boolean,
        baseHue: number,
        levelIndex: number,
        opacity: number
      ) => {
        ctx.save();

        const interpolatePoint = (u: number, v: number) => {
          const tu = Math.max(0, Math.min(1, u));
          const tv = Math.max(0, Math.min(1, v));
          const x = (1 - tu) * (1 - tv) * p0.x + tu * (1 - tv) * p1.x + tu * tv * p2.x + (1 - tu) * tv * p3.x;
          const y = (1 - tu) * (1 - tv) * p0.y + tu * (1 - tv) * p1.y + tu * tv * p2.y + (1 - tu) * tv * p3.y;
          return { x, y };
        };

        const rows = 4;
        const cols = 3;

        for (let r = 0; r < rows; r++) {
          const v_start = r / rows;
          const v_end = (r + 1) / rows;
          const stagger = (r % 2) * 0.5;

          for (let c = -1; c <= cols; c++) {
            const u_start = (c - stagger) / cols;
            const u_end = (c + 1 - stagger) / cols;

            if (u_end <= 0 || u_start >= 1) continue;

            const b0 = interpolatePoint(u_start, v_start);
            const b1 = interpolatePoint(u_end, v_start);
            const b2 = interpolatePoint(u_end, v_end);
            const b3 = interpolatePoint(u_start, v_end);

            // Seed based on level, row, and column for deterministic styling
            const seed = levelIndex * 17 + r * 29 + c * 43 + (isRightFace ? 71 : 0);
            const hash1 = Math.abs(Math.sin(seed) * 1000) % 1;
            const hash2 = Math.abs(Math.sin(seed + 1.2) * 1000) % 1;
            const hash3 = Math.abs(Math.sin(seed + 2.7) * 1000) % 1;

            // Shift hue and saturation to fit the gorgeous peach/pink/coral palette in the provided image
            // We gently blend the active game's dynamic color with the warm hand-painted watercolor theme
            const brickHue = (baseHue + (hash1 - 0.5) * 8 + 360) % 360;
            const brickSat = (isRightFace ? 56 : 68) + (hash2 - 0.5) * 6;
            const brickLight = (isRightFace ? 46 : 58) + (hash3 - 0.5) * 5;

            // Draw each individual hand-painted tile with smooth "pillowed" shading
            ctx.beginPath();
            ctx.moveTo(b0.x, b0.y);
            ctx.lineTo(b1.x, b1.y);
            ctx.lineTo(b2.x, b2.y);
            ctx.lineTo(b3.x, b3.y);
            ctx.closePath();

            // Gradient from bottom-right (shadowed) to top-left (illuminated)
            const grad = ctx.createLinearGradient(b2.x, b2.y, b0.x, b0.y);
            grad.addColorStop(0, `hsla(${brickHue}, ${brickSat}%, ${brickLight - 4}%, ${opacity})`);
            grad.addColorStop(0.4, `hsla(${brickHue}, ${brickSat + 3}%, ${brickLight}%, ${opacity})`);
            grad.addColorStop(1, `hsla(${brickHue}, ${brickSat + 8}%, ${brickLight + 6}%, ${opacity})`);
            ctx.fillStyle = grad;
            ctx.fill();

            // 1. Cozy light inner bevel highlight (top and left edges)
            ctx.strokeStyle = `rgba(255, 255, 255, ${isRightFace ? 0.12 : 0.25 * opacity})`;
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(b3.x, b3.y);
            ctx.lineTo(b0.x, b0.y);
            ctx.lineTo(b1.x, b1.y);
            ctx.stroke();

            // 2. Soft shadow crevice (bottom and right edges)
            ctx.strokeStyle = `rgba(0, 0, 0, ${isRightFace ? 0.12 : 0.06 * opacity})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(b1.x, b1.y);
            ctx.lineTo(b2.x, b2.y);
            ctx.lineTo(b3.x, b3.y);
            ctx.stroke();

            // 3. Toonish hand-painted outline (very thin, cozy warm color)
            const borderHue = (brickHue + 15) % 360;
            ctx.strokeStyle = `hsla(${borderHue}, ${brickSat - 15}%, ${brickLight - 16}%, ${0.4 * opacity})`;
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            ctx.moveTo(b0.x, b0.y);
            ctx.lineTo(b1.x, b1.y);
            ctx.lineTo(b2.x, b2.y);
            ctx.lineTo(b3.x, b3.y);
            ctx.closePath();
        ctx.stroke();
          }
        }
        ctx.restore();
      };

      // Helper to draw the hand-painted pastel terrace tile texture on the top face
      const drawTerraceTexture = (
        p0: { x: number; y: number },
        p1: { x: number; y: number },
        p2: { x: number; y: number },
        p3: { x: number; y: number },
        baseHue: number,
        levelIndex: number,
        opacity: number
      ) => {
        ctx.save();

        const interpolatePoint = (u: number, v: number) => {
          const tu = Math.max(0, Math.min(1, u));
          const tv = Math.max(0, Math.min(1, v));
          const x = (1 - tu) * (1 - tv) * p0.x + tu * (1 - tv) * p1.x + tu * tv * p2.x + (1 - tu) * tv * p3.x;
          const y = (1 - tu) * (1 - tv) * p0.y + tu * (1 - tv) * p1.y + tu * tv * p2.y + (1 - tu) * tv * p3.y;
          return { x, y };
        };

        // We segment the top surface into clean, hand-painted terrace tile blocks
        const rows = 5;
        const cols = 5;

        for (let r = 0; r < rows; r++) {
          const v_start = r / rows;
          const v_end = (r + 1) / rows;
          // Stagger the tiles horizontally for that classic organic terrace layout
          const stagger = (r % 2) * 0.5;

          for (let c = -1; c <= cols; c++) {
            const u_start = (c - stagger) / cols;
            const u_end = (c + 1 - stagger) / cols;

            if (u_end <= 0 || u_start >= 1) continue;

            const b0 = interpolatePoint(u_start, v_start);
            const b1 = interpolatePoint(u_end, v_start);
            const b2 = interpolatePoint(u_end, v_end);
            const b3 = interpolatePoint(u_start, v_end);

            // Deterministic pseudo-random seed for organic tile variety
            const seed = levelIndex * 41 + r * 19 + c * 53 + 127;
            const hash1 = Math.abs(Math.sin(seed) * 1000) % 1;
            const hash2 = Math.abs(Math.sin(seed + 1.6) * 1000) % 1;
            const hash3 = Math.abs(Math.sin(seed + 3.1) * 1000) % 1;

            // Harmonious pastel terrace color palette matching the hand-painted reference image
            let tHue = 0;
            let tSat = 0;
            let tLight = 0;

            const tileType = Math.floor(hash1 * 4);
            if (tileType === 0) {
              // Cozy warm rose / coral peach
              tHue = (345 + hash2 * 25) % 360;
              tSat = 18 + hash3 * 6;
              tLight = 68 + hash1 * 5;
            } else if (tileType === 1) {
              // Muted lavender / gray-purple
              tHue = 265 + hash2 * 25;
              tSat = 10 + hash3 * 5;
              tLight = 63 + hash1 * 4;
            } else if (tileType === 2) {
              // Soft sage / olive green wash
              tHue = 92 + hash2 * 28;
              tSat = 10 + hash3 * 5;
              tLight = 64 + hash1 * 4;
            } else {
              // Delicate ochre / sand yellow
              tHue = 40 + hash2 * 12;
              tSat = 14 + hash3 * 6;
              tLight = 69 + hash1 * 4;
            }

            // Draw individual tile path
            ctx.beginPath();
            ctx.moveTo(b0.x, b0.y);
            ctx.lineTo(b1.x, b1.y);
            ctx.lineTo(b2.x, b2.y);
            ctx.lineTo(b3.x, b3.y);
            ctx.closePath();

            // Radial gradient center-highlight to mimic hand-brushed watercolor texture
            const cx_tile = (b0.x + b1.x + b2.x + b3.x) / 4;
            const cy_tile = (b0.y + b1.y + b2.y + b3.y) / 4;
            const tileRadius = Math.max(3, Math.sqrt((b2.x - b0.x) ** 2 + (b2.y - b0.y) ** 2) * 0.65);
            
            const tileGrad = ctx.createRadialGradient(cx_tile, cy_tile, 1, cx_tile, cy_tile, tileRadius);
            tileGrad.addColorStop(0, `hsla(${tHue}, ${tSat + 5}%, ${tLight + 3}%, ${opacity})`);
            tileGrad.addColorStop(0.5, `hsla(${tHue}, ${tSat}%, ${tLight}%, ${opacity})`);
            tileGrad.addColorStop(1, `hsla(${tHue}, ${tSat - 3}%, ${tLight - 4}%, ${opacity})`);
            
            ctx.fillStyle = tileGrad;
            ctx.fill();

            // Cozy hand-painted white edge highlights
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 * opacity})`;
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.moveTo(b3.x, b3.y);
            ctx.lineTo(b0.x, b0.y);
            ctx.lineTo(b1.x, b1.y);
            ctx.stroke();

            // Gentle shade outlines on opposing sides
            ctx.strokeStyle = `rgba(0, 0, 0, ${0.06 * opacity})`;
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            ctx.moveTo(b1.x, b1.y);
            ctx.lineTo(b2.x, b2.y);
            ctx.lineTo(b3.x, b3.y);
            ctx.stroke();

            // Distinct warm ink line boundaries to reinforce the delightful toon look
            ctx.strokeStyle = `rgba(32, 38, 46, ${0.16 * opacity})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(b0.x, b0.y);
            ctx.lineTo(b1.x, b1.y);
            ctx.lineTo(b2.x, b2.y);
            ctx.lineTo(b3.x, b3.y);
            ctx.closePath();
            ctx.stroke();
          }
        }
        ctx.restore();
      };

      const isPointExposed = (px: number, pz: number) => {
        if (isMoving) return false;
        if (!above) return true; // if no block above (e.g. roof), top surface is exposed
        
        // Safety margin so elements don't clip through the walls of the block above
        const margin = 0.5;
        const insideAboveX = px >= (above.x - above.width/2 - margin) && px <= (above.x + above.width/2 + margin);
        const insideAboveZ = pz >= (above.z - above.depth/2 - margin) && pz <= (above.z + above.depth/2 + margin);
        return !(insideAboveX && insideAboveZ);
      };

      if (drawDecorationsOnly) {
        const hasTerrace = above && (above.width < w - 2 || above.depth < d - 2);
        if (hasTerrace) {
          const drawBack = drawDecorationsOnly === true || drawDecorationsOnly === 'back';
          const drawFront = drawDecorationsOnly === true || drawDecorationsOnly === 'front';
          // --- DRAW DECORATIONS (RAILINGS & POTTED PLANTS) ---
          const drawRailingOnEdge = (
            x1: number, z1: number,
            x2: number, z2: number,
            edgeLength: number
          ) => {
            const railH = 8;
            const numPosts = Math.max(3, Math.floor(edgeLength / 10));
            
            ctx.save();
            ctx.strokeStyle = `rgba(32, 38, 46, ${0.85 * opacity})`;
            ctx.lineWidth = 1.25;

            const topPoints: {x: number, y: number}[] = [];

            for (let pIdx = 0; pIdx < numPosts; pIdx++) {
              const f = pIdx / (numPosts - 1);
              const rx = x1 + f * (x2 - x1);
              const rz = z1 + f * (z2 - z1);

              const bot = projectVec(rx, y + h, rz, cWidth, cHeight, camY, zoom);
              const top = projectVec(rx, y + h + railH, rz, cWidth, cHeight, camY, zoom);

              topPoints.push(top);

              ctx.beginPath();
              ctx.moveTo(bot.x, bot.y);
              ctx.lineTo(top.x, top.y);
              ctx.stroke();

              // Draw post cap (tiny circle)
              ctx.fillStyle = `rgba(32, 38, 46, ${opacity})`;
              ctx.beginPath();
              ctx.arc(top.x, top.y, 1.1, 0, Math.PI * 2);
              ctx.fill();
            }

            // Draw top rail
            if (topPoints.length > 1) {
              ctx.beginPath();
              ctx.moveTo(topPoints[0].x, topPoints[0].y);
              for (let k = 1; k < topPoints.length; k++) {
                ctx.lineTo(topPoints[k].x, topPoints[k].y);
              }
              ctx.stroke();

              // Draw middle rail
              ctx.strokeStyle = `rgba(32, 38, 46, ${0.5 * opacity})`;
              ctx.lineWidth = 0.65;
              ctx.beginPath();
              for (let pIdx = 0; pIdx < numPosts; pIdx++) {
                const f = pIdx / (numPosts - 1);
                const rx = x1 + f * (x2 - x1);
                const rz = z1 + f * (z2 - z1);
                const mid = projectVec(rx, y + h + railH * 0.5, rz, cWidth, cHeight, camY, zoom);
                if (pIdx === 0) {
                  ctx.moveTo(mid.x, mid.y);
                } else {
                  ctx.lineTo(mid.x, mid.y);
                }
              }
              ctx.stroke();
            }

            ctx.restore();
          };

          const drawPottedPlant = (px: number, pz: number) => {
            ctx.save();

            const potBaseH = 0;
            const potTopH = 4;

            const pBase = projectVec(px, y + h + potBaseH, pz, cWidth, cHeight, camY, zoom);
            const pTop = projectVec(px, y + h + potTopH, pz, cWidth, cHeight, camY, zoom);

            // Draw pot as small terracotta cylinder
            ctx.fillStyle = `hsla(18, 65%, 48%, ${opacity})`; // Terracotta orange
            ctx.strokeStyle = `hsla(18, 70%, 30%, ${opacity * 0.4})`;
            ctx.lineWidth = 0.6;

            const potW1 = 2.5; 
            const potW2 = 3.6; 

            ctx.beginPath();
            ctx.moveTo(pBase.x - potW1, pBase.y);
            ctx.lineTo(pTop.x - potW2, pTop.y);
            ctx.lineTo(pTop.x + potW2, pTop.y);
            ctx.lineTo(pBase.x + potW1, pBase.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Draw pot rim
            ctx.fillStyle = `hsla(18, 60%, 54%, ${opacity})`;
            ctx.fillRect(pTop.x - potW2 - 0.4, pTop.y - 0.8, potW2 * 2 + 0.8, 1.2);
            ctx.strokeRect(pTop.x - potW2 - 0.4, pTop.y - 0.8, potW2 * 2 + 0.8, 1.2);

            // Draw dark soil
            ctx.fillStyle = `hsla(25, 30%, 15%, ${opacity})`;
            ctx.beginPath();
            ctx.ellipse(pTop.x, pTop.y, potW2, 0.8, 0, 0, Math.PI * 2);
            ctx.fill();

            // Draw green leaves
            const clusterColors = [
              `hsla(125, 48%, 28%, ${opacity})`, 
              `hsla(135, 55%, 36%, ${opacity})`, 
              `hsla(145, 62%, 44%, ${opacity})`, 
            ];

            const leafRadii = [3.5, 3.0, 2.4];
            const leafOffsetsY = [1.5, 3.8, 6.0];

            clusterColors.forEach((color, idx) => {
              ctx.fillStyle = color;
              ctx.strokeStyle = `rgba(0, 0, 0, ${0.12 * opacity})`;
              ctx.lineWidth = 0.4;

              const cy = pTop.y - leafOffsetsY[idx];
              const r = leafRadii[idx];

              ctx.beginPath();
              ctx.arc(pTop.x, cy, r, 0, Math.PI * 2);
              ctx.arc(pTop.x - r * 0.5, cy + r * 0.1, r * 0.6, 0, Math.PI * 2);
              ctx.arc(pTop.x + r * 0.5, cy + r * 0.1, r * 0.6, 0, Math.PI * 2);
              ctx.arc(pTop.x, cy - r * 0.4, r * 0.7, 0, Math.PI * 2);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            });

            // Draw tiny flowers
            const flowerColor = `hsla(${((baseHue + 120) % 360)}, 95%, 62%, ${opacity})`;
            ctx.fillStyle = flowerColor;
            const flowerOffsets = [
              { dx: -1.5, dy: -3.0 },
              { dx: 1.5, dy: -4.5 },
              { dx: 0, dy: -6.5 },
            ];
            flowerOffsets.forEach((offset) => {
              ctx.beginPath();
              ctx.arc(pTop.x + offset.dx, pTop.y + offset.dy, 1.0, 0, Math.PI * 2);
              ctx.fill();
            });

            ctx.restore();
          };

          // 1. Draw Railings on Exposed Edges
          // Front-Left Edge: z = z + d/2 (from x - w/2 to x + w/2)
          if (drawFront && isPointExposed(x, z + d/2 - 1.5)) {
            drawRailingOnEdge(x - w/2 + 1.5, z + d/2 - 1.5, x + w/2 - 1.5, z + d/2 - 1.5, w);
          }
          // Front-Right Edge: x = x + w/2 (from z - d/2 to z + d/2)
          if (drawFront && isPointExposed(x + w/2 - 1.5, z)) {
            drawRailingOnEdge(x + w/2 - 1.5, z + d/2 - 1.5, x + w/2 - 1.5, z - d/2 + 1.5, d);
          }
          // Back-Left Edge: x = x - w/2 (from z - d/2 to z + d/2)
          if (drawBack && isPointExposed(x - w/2 + 1.5, z)) {
            drawRailingOnEdge(x - w/2 + 1.5, z + d/2 - 1.5, x - w/2 + 1.5, z - d/2 + 1.5, d);
          }
          // Back-Right Edge: z = z - d/2 (from x - w/2 to x + w/2)
          if (drawBack && isPointExposed(x, z - d/2 + 1.5)) {
            drawRailingOnEdge(x - w/2 + 1.5, z - d/2 + 1.5, x + w/2 - 1.5, z - d/2 + 1.5, w);
          }

          // 2. Draw Potted Plants in Exposed Corners
          const cornerMargin = 4.2;
          const corners = [
            { name: 'left', x: x - w/2 + cornerMargin, z: z + d/2 - cornerMargin }, // Left corner
            { name: 'front', x: x + w/2 - cornerMargin, z: z + d/2 - cornerMargin }, // Front corner
            { name: 'back', x: x - w/2 + cornerMargin, z: z - d/2 + cornerMargin }, // Back corner
            { name: 'right', x: x + w/2 - cornerMargin, z: z - d/2 + cornerMargin }, // Right corner
          ];

          corners.forEach((c) => {
            const isBackCorner = c.name === 'back';
            const shouldDrawCorner = (isBackCorner && drawBack) || (!isBackCorner && drawFront);
            if (shouldDrawCorner && isPointExposed(c.x, c.z)) {
              if (above) {
                const dx = Math.abs(c.x - above.x);
                const dz = Math.abs(c.z - above.z);
                if (dx < above.width/2 + 1.5 && dz < above.depth/2 + 1.5) {
                  return;
                }
              }
              drawPottedPlant(c.x, c.z);
            }
          });
        }
        ctx.restore();
        return;
      }




      if (isFoundation) {
        // --- 1. FOUNDATION STONE BLOCK ---
        const fHue = (baseHue + 20) % 360;
        const deckColor = `hsla(${fHue}, 12%, 66%, ${opacity})`;
        const leftFaceColor = `hsla(${fHue}, 10%, 53%, ${opacity})`;
        const rightFaceColor = `hsla(${fHue}, 8%, 42%, ${opacity})`;

        // Left Face
        ctx.fillStyle = leftFaceColor;
        ctx.beginPath();
        ctx.moveTo(v3.x, v3.y);
        ctx.lineTo(v2.x, v2.y);
        ctx.lineTo(v6.x, v6.y);
        ctx.lineTo(v7.x, v7.y);
        ctx.closePath();
        ctx.fill();

        // Right Face
        ctx.fillStyle = rightFaceColor;
        ctx.beginPath();
        ctx.moveTo(v2.x, v2.y);
        ctx.lineTo(v1.x, v1.y);
        ctx.lineTo(v5.x, v5.y);
        ctx.lineTo(v6.x, v6.y);
        ctx.closePath();
        ctx.fill();

        // Deck Top Face with hand-painted watercolor terrace tiles
        drawTerraceTexture(v0, v1, v2, v3, fHue, 0, opacity);

        // Draw arches inside left/right faces
        const drawFaceArch = (pTopLeft: any, pTopRight: any, pBottomRight: any, pBottomLeft: any) => {
          const widthFrac = 0.52; 
          const heightFrac = 0.68; 

          const t1 = {
            x: pTopLeft.x + (1 - widthFrac) * 0.5 * (pTopRight.x - pTopLeft.x),
            y: pTopLeft.y + (1 - widthFrac) * 0.5 * (pTopRight.y - pTopLeft.y),
          };
          const t2 = {
            x: pTopLeft.x + (1 - (1 - widthFrac) * 0.5) * (pTopRight.x - pTopLeft.x),
            y: pTopLeft.y + (1 - (1 - widthFrac) * 0.5) * (pTopRight.y - pTopLeft.y),
          };

          const b1 = {
            x: pBottomLeft.x + (1 - widthFrac) * 0.5 * (pBottomRight.x - pBottomLeft.x),
            y: pBottomLeft.y + (1 - widthFrac) * 0.5 * (pBottomRight.y - pBottomLeft.y),
          };
          const b2 = {
            x: pBottomLeft.x + (1 - (1 - widthFrac) * 0.5) * (pBottomRight.x - pBottomLeft.x),
            y: pBottomLeft.y + (1 - (1 - widthFrac) * 0.5) * (pBottomRight.y - pBottomLeft.y),
          };

          const h1 = {
            x: b1.x + heightFrac * (t1.x - b1.x),
            y: b1.y + heightFrac * (t1.y - b1.y),
          };
          const h2 = {
            x: b2.x + heightFrac * (t2.x - b2.x),
            y: b2.y + heightFrac * (t2.y - b2.y),
          };

          const archCenter = {
            x: (h1.x + h2.x) / 2,
            y: (h1.y + h2.y) / 2 - Math.abs(h2.x - h1.x) * 0.2, 
          };

          ctx.fillStyle = `rgba(18, 22, 28, ${opacity})`;
          ctx.beginPath();
          ctx.moveTo(b1.x, b1.y);
          ctx.lineTo(h1.x, h1.y);
          ctx.quadraticCurveTo(archCenter.x, archCenter.y, h2.x, h2.y);
          ctx.lineTo(b2.x, b2.y);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = `rgba(255, 255, 255, ${0.18 * opacity})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(b1.x, b1.y);
          ctx.lineTo(h1.x, h1.y);
          ctx.quadraticCurveTo(archCenter.x, archCenter.y, h2.x, h2.y);
          ctx.lineTo(b2.x, b2.y);
          ctx.stroke();
        };

        drawFaceArch(v3, v2, v6, v7);
        drawFaceArch(v2, v1, v5, v6);

        ctx.strokeStyle = `rgba(255, 255, 255, ${0.22 * opacity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(v0.x, v0.y);
        ctx.lineTo(v1.x, v1.y);
        ctx.lineTo(v2.x, v2.y);
        ctx.lineTo(v3.x, v3.y);
        ctx.closePath();
        ctx.stroke();

      } else {
        // --- 2. TOWNSCAPER COZY PASTEL HOUSE BLOCK ---
        const wallHue = baseHue;
        
        // Soft sun-baked watercolor pastels
        const topColor = `hsla(${wallHue}, 68%, 68%, ${opacity})`;
        const leftBaseColor = `hsla(${wallHue}, 60%, 56%, ${opacity})`;
        const rightBaseColor = `hsla(${wallHue}, 50%, 45%, ${opacity})`;

        const blocks = stateRef.current.blocks;
        const previousBlock = (!isMoving && levelIndex > 0) ? blocks[levelIndex - 1] : null;

        // Draw Support Pillars for Overhanging/Extended parts first so they get layered underneath the block body!
        if (!isMoving && previousBlock && !drawDecorationsOnly) {
          const blockMinX = x - w / 2;
          const blockMaxX = x + w / 2;
          const blockMinZ = z - d / 2;
          const blockMaxZ = z + d / 2;

          const prevMinX = previousBlock.x - previousBlock.width / 2;
          const prevMaxX = previousBlock.x + previousBlock.width / 2;
          const prevMinZ = previousBlock.z - previousBlock.depth / 2;
          const prevMaxZ = previousBlock.z + previousBlock.depth / 2;

          // Side 1: Overhang on Right side (positive X side)
          const overhangRight = blockMaxX - prevMaxX;
          if (overhangRight >= 1.5) {
            const px = blockMaxX - Math.max(2.5, overhangRight / 2);
            const numPillars = d >= 35 ? 3 : 2;
            const spacing = numPillars === 3 ? [0.18, 0.5, 0.82] : [0.25, 0.75];
            spacing.forEach((f) => {
              const pz = blockMinZ + f * (blockMaxZ - blockMinZ);
              const py2 = findSupportY(px, pz, levelIndex);
              if (y > py2) {
                drawSupportPillar(px, pz, y, py2, wallHue);
              }
            });
          }

          // Side 2: Overhang on Left side (negative X side)
          const overhangLeft = prevMinX - blockMinX;
          if (overhangLeft >= 1.5) {
            const px = blockMinX + Math.max(2.5, overhangLeft / 2);
            const numPillars = d >= 35 ? 3 : 2;
            const spacing = numPillars === 3 ? [0.18, 0.5, 0.82] : [0.25, 0.75];
            spacing.forEach((f) => {
              const pz = blockMinZ + f * (blockMaxZ - blockMinZ);
              const py2 = findSupportY(px, pz, levelIndex);
              if (y > py2) {
                drawSupportPillar(px, pz, y, py2, wallHue);
              }
            });
          }

          // Side 3: Overhang on Front side (positive Z side)
          const overhangFront = blockMaxZ - prevMaxZ;
          if (overhangFront >= 1.5) {
            const pz = blockMaxZ - Math.max(2.5, overhangFront / 2);
            const numPillars = w >= 35 ? 3 : 2;
            const spacing = numPillars === 3 ? [0.18, 0.5, 0.82] : [0.25, 0.75];
            spacing.forEach((f) => {
              const px = blockMinX + f * (blockMaxX - blockMinX);
              const py2 = findSupportY(px, pz, levelIndex);
              if (y > py2) {
                drawSupportPillar(px, pz, y, py2, wallHue);
              }
            });
          }

          // Side 4: Overhang on Back side (negative Z side)
          const overhangBack = prevMinZ - blockMinZ;
          if (overhangBack >= 1.5) {
            const pz = blockMinZ + Math.max(2.5, overhangBack / 2);
            const numPillars = w >= 35 ? 3 : 2;
            const spacing = numPillars === 3 ? [0.18, 0.5, 0.82] : [0.25, 0.75];
            spacing.forEach((f) => {
              const px = blockMinX + f * (blockMaxX - blockMinX);
              const py2 = findSupportY(px, pz, levelIndex);
              if (y > py2) {
                drawSupportPillar(px, pz, y, py2, wallHue);
              }
            });
          }
        }

        // Left Face
        let leftFaceColor: string | CanvasGradient;
        if (previousBlock) {
          const leftGrad = ctx.createLinearGradient(
            (v7.x + v6.x) / 2, (v7.y + v6.y) / 2,
            (v3.x + v2.x) / 2, (v3.y + v2.y) / 2
          );
          leftGrad.addColorStop(0, `hsla(${previousBlock.hue}, 60%, 56%, ${opacity})`);
          leftGrad.addColorStop(1, leftBaseColor);
          leftFaceColor = leftGrad;
        } else {
          leftFaceColor = leftBaseColor;
        }

        ctx.fillStyle = leftFaceColor;
        ctx.beginPath();
        ctx.moveTo(v3.x, v3.y);
        ctx.lineTo(v2.x, v2.y);
        ctx.lineTo(v6.x, v6.y);
        ctx.lineTo(v7.x, v7.y);
        ctx.closePath();
        ctx.fill();

        // Draw watercolor brick texture on Left Face
        if (!isMoving) {
          drawBrickTexture(v3, v2, v6, v7, false, baseHue, levelIndex, opacity);
        }

        // Dark ink-line outline on Left Face
        ctx.strokeStyle = `rgba(32, 38, 46, ${0.45 * opacity})`;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(v7.x, v7.y);
        ctx.lineTo(v3.x, v3.y);
        ctx.lineTo(v2.x, v2.y);
        ctx.lineTo(v6.x, v6.y);
        ctx.stroke();

        // Right Face
        let rightFaceColor: string | CanvasGradient;
        if (previousBlock) {
          const rightGrad = ctx.createLinearGradient(
            (v6.x + v5.x) / 2, (v6.y + v5.y) / 2,
            (v2.x + v1.x) / 2, (v2.y + v1.y) / 2
          );
          rightGrad.addColorStop(0, `hsla(${previousBlock.hue}, 50%, 45%, ${opacity})`);
          rightGrad.addColorStop(1, rightBaseColor);
          rightFaceColor = rightGrad;
        } else {
          rightFaceColor = rightBaseColor;
        }

        ctx.fillStyle = rightFaceColor;
        ctx.beginPath();
        ctx.moveTo(v2.x, v2.y);
        ctx.lineTo(v1.x, v1.y);
        ctx.lineTo(v5.x, v5.y);
        ctx.lineTo(v6.x, v6.y);
        ctx.closePath();
        ctx.fill();

        // Draw watercolor brick texture on Right Face
        if (!isMoving) {
          drawBrickTexture(v2, v1, v5, v6, true, baseHue, levelIndex, opacity);
        }

        // Dark ink-line outline on Right Face
        ctx.strokeStyle = `rgba(32, 38, 46, ${0.45 * opacity})`;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(v6.x, v6.y);
        ctx.lineTo(v2.x, v2.y);
        ctx.lineTo(v1.x, v1.y);
        ctx.lineTo(v5.x, v5.y);
        ctx.stroke();

        // Top Face (If not roof, floor surface)
        if (!isRoof) {
          if (isMoving) {
            ctx.fillStyle = topColor;
            ctx.beginPath();
            ctx.moveTo(v0.x, v0.y);
            ctx.lineTo(v1.x, v1.y);
            ctx.lineTo(v2.x, v2.y);
            ctx.lineTo(v3.x, v3.y);
            ctx.closePath();
            ctx.fill();
          } else {
            drawTerraceTexture(v0, v1, v2, v3, baseHue, levelIndex, opacity);
          }

          // Dark ink-line outline on Top Face - only if no block above to keep stacked blocks seamless
          if (!above) {
            ctx.strokeStyle = `rgba(32, 38, 46, ${0.35 * opacity})`;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(v0.x, v0.y);
            ctx.lineTo(v1.x, v1.y);
            ctx.lineTo(v2.x, v2.y);
            ctx.lineTo(v3.x, v3.y);
            ctx.closePath();
            ctx.stroke();
          }
        }

        // --- DRAW FACADE TRIMS (WHITE COLUMNS & HORIZONTAL BANDS) ---
        if (!isMoving) {
          const trimColor = `rgba(255, 255, 255, ${0.82 * opacity})`;
          ctx.strokeStyle = trimColor;
          ctx.lineWidth = 1.5;

          // Vertical columns are always drawn to form continuous pillars
          ctx.beginPath();
          ctx.moveTo(v3.x, v3.y); ctx.lineTo(v7.x, v7.y);
          ctx.moveTo(v2.x, v2.y); ctx.lineTo(v6.x, v6.y);
          ctx.moveTo(v1.x, v1.y); ctx.lineTo(v5.x, v5.y);
          ctx.stroke();

          // Bottom horizontal band: white on the bottom-most level, otherwise none to ensure clean borders
          if (!previousBlock) {
            ctx.strokeStyle = trimColor;
            ctx.beginPath();
            ctx.moveTo(v7.x, v7.y); ctx.lineTo(v6.x, v6.y); ctx.lineTo(v5.x, v5.y);
            ctx.stroke();
          }

          // Top horizontal band: only thick white trim if it's the roof or active block
          if (isRoof) {
            ctx.strokeStyle = trimColor;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(v3.x, v3.y); ctx.lineTo(v2.x, v2.y); ctx.lineTo(v1.x, v1.y);
            ctx.stroke();
          }
        }

        // --- PROCEDURAL ARCHED WINDOWS & DOORS ---
        const drawFacadeOpenings = (
          pTopLeft: any, pTopRight: any, pBottomRight: any, pBottomLeft: any,
          sizeValue: number, isRightFace: boolean
        ) => {
          const numOpenings = Math.max(1, Math.floor(sizeValue / 32));
          
          const getFacePoint = (tFrac: number, vFrac: number) => {
            const tx = pTopLeft.x + tFrac * (pTopRight.x - pTopLeft.x);
            const ty = pTopLeft.y + tFrac * (pTopRight.y - pTopLeft.y);
            const bx = pBottomLeft.x + tFrac * (pBottomRight.x - pBottomLeft.x);
            const by = pBottomLeft.y + tFrac * (pBottomRight.y - pBottomLeft.y);
            return {
              x: tx + vFrac * (bx - tx),
              y: ty + vFrac * (by - ty)
            };
          };

          for (let fIdx = 0; fIdx < numOpenings; fIdx++) {
            const f = (fIdx + 0.5) / numOpenings;

            const isDoor = levelIndex === 1 && fIdx === Math.floor(numOpenings / 2);

            if (isDoor) {
              const hw = numOpenings === 1 ? 0.14 : 0.10;
              const vBot = 0.98;
              const vArchStart = 0.54;
              const vArchApex = 0.40;
              const vControl = 2 * vArchApex - vArchStart; // 0.26

              const pBL = getFacePoint(f - hw, vBot);
              const pBR = getFacePoint(f + hw, vBot);
              const pASL = getFacePoint(f - hw, vArchStart);
              const pASR = getFacePoint(f + hw, vArchStart);
              const pAC = getFacePoint(f, vControl);
              const pApex = getFacePoint(f, vArchApex);

              ctx.save();
              ctx.fillStyle = `hsla(20, 68%, 34%, ${opacity})`; 
              ctx.beginPath();
              ctx.moveTo(pBL.x, pBL.y);
              ctx.lineTo(pASL.x, pASL.y);
              ctx.quadraticCurveTo(pAC.x, pAC.y, pASR.x, pASR.y);
              ctx.lineTo(pBR.x, pBR.y);
              ctx.closePath();
              ctx.fill();

              // Vertical crease line in the middle of the door
              ctx.strokeStyle = `rgba(0, 0, 0, ${0.28 * opacity})`;
              ctx.lineWidth = 0.55;
              ctx.beginPath();
              const pBotCenter = getFacePoint(f, vBot);
              ctx.moveTo(pBotCenter.x, pBotCenter.y);
              ctx.lineTo(pApex.x, pApex.y);
              ctx.stroke();

              // Door knob positioned perfectly on the isometric face
              ctx.fillStyle = `rgba(251, 191, 36, ${opacity})`;
              ctx.beginPath();
              const knobT = f + (isRightFace ? -hw * 0.48 : hw * 0.48);
              const knobV = vBot - (vBot - vArchApex) * 0.42;
              const pKnob = getFacePoint(knobT, knobV);
              ctx.arc(pKnob.x, pKnob.y, 0.85, 0, Math.PI * 2);
              ctx.fill();

              // Arched door dark frame/stroke
              ctx.strokeStyle = `rgba(32, 38, 46, ${0.85 * opacity})`;
              ctx.lineWidth = 1.25;
              ctx.beginPath();
              ctx.moveTo(pBL.x, pBL.y);
              ctx.lineTo(pASL.x, pASL.y);
              ctx.quadraticCurveTo(pAC.x, pAC.y, pASR.x, pASR.y);
              ctx.lineTo(pBR.x, pBR.y);
              ctx.stroke();

              ctx.restore();
            } else {
              const winSize = Math.min(22, sizeValue * 0.42, h * 0.42);
              const hw = (winSize / 2) / sizeValue;
              const vh = (winSize / 2) / h;
              const vCenter = 0.52;

              ctx.save();

              const perfectStreakActive = stateRef.current.perfectCombo > 0;
              const isLit = perfectStreakActive || (levelIndex % 3 === 0 && fIdx % 2 === 0);
              
              // Draw the background outer pane (window frame)
              const bgFill = isLit 
                ? `rgba(255, 251, 235, ${opacity})` 
                : `rgba(240, 249, 255, ${opacity})`;
              const bgStroke = `rgba(32, 45, 64, ${0.85 * opacity})`;
              
              const pTL = getFacePoint(f - hw, vCenter - vh);
              const pTR = getFacePoint(f + hw, vCenter - vh);
              const pBR = getFacePoint(f + hw, vCenter + vh);
              const pBL = getFacePoint(f - hw, vCenter + vh);

              ctx.beginPath();
              ctx.moveTo(pTL.x, pTL.y);
              ctx.lineTo(pTR.x, pTR.y);
              ctx.lineTo(pBR.x, pBR.y);
              ctx.lineTo(pBL.x, pBL.y);
              ctx.closePath();
              ctx.fillStyle = bgFill;
              ctx.fill();
              ctx.strokeStyle = bgStroke;
              ctx.lineWidth = 1.25;
              ctx.stroke();

              // Helper to draw a pane inside local coordinates [-1, 1]
              const drawPane = (lwMin: number, lwMax: number, lhMin: number, lhMax: number, fill: string, stroke: string) => {
                const p00 = getFacePoint(f + lwMin * hw, vCenter + lhMin * vh);
                const p10 = getFacePoint(f + lwMax * hw, vCenter + lhMin * vh);
                const p11 = getFacePoint(f + lwMax * hw, vCenter + lhMax * vh);
                const p01 = getFacePoint(f + lwMin * hw, vCenter + lhMax * vh);

                ctx.beginPath();
                ctx.moveTo(p00.x, p00.y);
                ctx.lineTo(p10.x, p10.y);
                ctx.lineTo(p11.x, p11.y);
                ctx.lineTo(p01.x, p01.y);
                ctx.closePath();
                ctx.fillStyle = fill;
                ctx.fill();
                if (stroke) {
                  ctx.strokeStyle = stroke;
                  ctx.lineWidth = 0.65;
                  ctx.stroke();
                }
              };

              const b = 0.16; // border gap
              const c = 0.08; // middle cross half-width

              const paneFill = isLit 
                ? `rgba(245, 158, 11, ${opacity})` 
                : `rgba(21, 128, 163, ${opacity})`;
              const paneStroke = isLit 
                ? `rgba(180, 83, 9, ${0.75 * opacity})` 
                : `rgba(32, 45, 64, ${0.75 * opacity})`;

              // Pane 1: Top-Left
              drawPane(-1 + b, -c, -1 + b, -c, paneFill, paneStroke);
              // Pane 2: Top-Right
              drawPane(c, 1 - b, -1 + b, -c, paneFill, paneStroke);
              // Pane 3: Bottom-Left
              drawPane(-1 + b, -c, c, 1 - b, paneFill, paneStroke);
              // Pane 4: Bottom-Right
              drawPane(c, 1 - b, c, 1 - b, paneFill, paneStroke);

              ctx.restore();
            }
          }
        };

        if (!isMoving) {
          drawFacadeOpenings(v3, v2, v6, v7, w, false);
          drawFacadeOpenings(v2, v1, v5, v6, d, true);
        }

        // --- CRAWLING COZY GREEN PLANTS (IVY) ---
        if (!isMoving && levelIndex > 0 && levelIndex <= 6) {
          const spawnIvyOnEdge = (pTop: any, pBot: any, isLeftEdge: boolean) => {
            const numIvyClusters = Math.max(1, 8 - levelIndex);
            ctx.save();
            ctx.fillStyle = `hsla(135, 55%, 31%, ${opacity * 0.85})`;
            ctx.strokeStyle = `hsla(140, 60%, 20%, ${opacity * 0.5})`;
            ctx.lineWidth = 0.5;

            for (let iCluster = 0; iCluster < numIvyClusters; iCluster++) {
              const t = (iCluster + 1) / (numIvyClusters + 1) * 0.65;
              const ipt = {
                x: pBot.x + t * (pTop.x - pBot.x),
                y: pBot.y + t * (pTop.y - pBot.y),
              };

              const numLeaves = 4 + Math.floor(Math.sin(iCluster + levelIndex) * 3);
              for (let l = 0; l < numLeaves; l++) {
                const ox = Math.cos(l * 1.5 + iCluster) * 3.5 * (isLeftEdge ? -0.8 : 0.8);
                const oy = Math.sin(l * 1.5) * 2.5 - 2;
                const r = 1.8 + Math.abs(Math.sin(l)) * 2;

                ctx.beginPath();
                ctx.arc(ipt.x + ox, ipt.y + oy, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
              }
            }
            ctx.restore();
          };

          if ((levelIndex + 2) % 3 === 0) {
            spawnIvyOnEdge(v3, v7, true);
          }
          if (levelIndex % 4 === 0) {
            spawnIvyOnEdge(v2, v6, false);
          }
        }

        // --- 3. ROOF DRAWING ---
        if (isRoof && !isMoving) {
          const roofHue = 15; 
          const roofH = Math.min(w, d) * 0.44; 
          const vApex = projectVec(x, y + h + roofH, z, cWidth, cHeight, camY, zoom);

          const rLeftColor = `hsla(${roofHue}, 62%, 54%, ${opacity})`;
          const rRightColor = `hsla(${roofHue}, 55%, 46%, ${opacity})`;

          ctx.fillStyle = rLeftColor;
          ctx.beginPath();
          ctx.moveTo(v3.x, v3.y);
          ctx.lineTo(v2.x, v2.y);
          ctx.lineTo(vApex.x, vApex.y);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = rRightColor;
          ctx.beginPath();
          ctx.moveTo(v2.x, v2.y);
          ctx.lineTo(v1.x, v1.y);
          ctx.lineTo(vApex.x, vApex.y);
          ctx.closePath();
          ctx.fill();

          // White trim
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.92 * opacity})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(v3.x, v3.y);
          ctx.lineTo(vApex.x, vApex.y);
          ctx.lineTo(v1.x, v1.y);
          ctx.moveTo(v2.x, v2.y);
          ctx.lineTo(vApex.x, vApex.y);
          ctx.stroke();

          // Dark ink outline overlay
          ctx.strokeStyle = `rgba(32, 38, 46, ${0.55 * opacity})`;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(v3.x, v3.y);
          ctx.lineTo(vApex.x, vApex.y);
          ctx.lineTo(v1.x, v1.y);
          ctx.moveTo(v2.x, v2.y);
          ctx.lineTo(vApex.x, vApex.y);
          ctx.stroke();

          // Ink shingles lines
          ctx.strokeStyle = `rgba(32, 38, 46, ${0.25 * opacity})`;
          ctx.lineWidth = 0.85;
          const numShingleRows = 4;
          for (let s = 1; s < numShingleRows; s++) {
            const f = s / numShingleRows;
            
            const slLeft = { x: v3.x + f * (vApex.x - v3.x), y: v3.y + f * (vApex.y - v3.y) };
            const slRight = { x: v2.x + f * (vApex.x - v2.x), y: v2.y + f * (vApex.y - v2.y) };
            ctx.beginPath();
            ctx.moveTo(slLeft.x, slLeft.y);
            ctx.lineTo(slRight.x, slRight.y);
            ctx.stroke();

            const srLeft = { x: v2.x + f * (vApex.x - v2.x), y: v2.y + f * (vApex.y - v2.y) };
            const srRight = { x: v1.x + f * (vApex.x - v1.x), y: v1.y + f * (vApex.y - v1.y) };
            ctx.beginPath();
            ctx.moveTo(srLeft.x, srLeft.y);
            ctx.lineTo(srRight.x, srRight.y);
            ctx.stroke();
          }

          // --- PROCEDURAL ROOF CHIMNEY ---
          const isGameOverOrShowcase = stateRef.current.gameState === 'GAME_OVER' || stateRef.current.gameState === 'SHOWCASE';
          if (isGameOverOrShowcase) {
            const chimScale = Math.min(w, d) / MAX_SIZE;
            const clampedScale = Math.max(0.35, Math.min(1.1, chimScale));

            const chimHeight = 13 * clampedScale;
            const chimHalfWidth = 2.5 * clampedScale;
            const chimCapHalfWidth = 3.5 * clampedScale;
            const chimCapHeight = 2 * clampedScale;

            const chimX = x + w * 0.22;
            const chimZ = z - d * 0.22;
            const chimY = y + h + roofH * 0.45;

            const vChimBottom = projectVec(chimX, chimY, chimZ, cWidth, cHeight, camY, zoom);
            const vChimTop = projectVec(chimX, chimY + chimHeight, chimZ, cWidth, cHeight, camY, zoom);

            ctx.fillStyle = `hsla(18, 55%, 48%, ${opacity})`; 
            ctx.strokeStyle = `rgba(32, 38, 46, ${0.65 * opacity})`;
            ctx.lineWidth = 1.25;

            ctx.beginPath();
            ctx.moveTo(vChimBottom.x - chimHalfWidth, vChimBottom.y);
            ctx.lineTo(vChimTop.x - chimHalfWidth, vChimTop.y);
            ctx.lineTo(vChimTop.x + chimHalfWidth, vChimTop.y);
            ctx.lineTo(vChimBottom.x + chimHalfWidth, vChimBottom.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = `rgba(30, 41, 59, ${opacity})`;
            ctx.fillRect(vChimTop.x - chimCapHalfWidth, vChimTop.y - chimCapHeight, chimCapHalfWidth * 2, chimCapHeight);
          }
        }
      }

      ctx.restore();
    };

    // Draw rotated cuboid debris
    const drawRotatedCuboid = (
      slice: FallingSlice,
      cWidth: number, cHeight: number,
      camY: number, zoom: number
    ) => {
      const { x, y, z, width: w, height: h, depth: d, rx, ry, rz, color } = slice;
      const cx = x;
      const cy = y + h/2;
      const cz = z;

      const rotateAndProject = (vx: number, vy: number, vz: number) => {
        let dx = vx - cx;
        let dy = vy - cy;
        let dz = vz - cz;

        // Apply 3D rotation matrices
        if (rx !== 0) {
          const cos = Math.cos(rx);
          const sin = Math.sin(rx);
          const dy1 = dy * cos - dz * sin;
          const dz1 = dy * sin + dz * cos;
          dy = dy1;
          dz = dz1;
        }
        if (ry !== 0) {
          const cos = Math.cos(ry);
          const sin = Math.sin(ry);
          const dx1 = dx * cos + dz * sin;
          const dz1 = -dx * sin + dz * cos;
          dx = dx1;
          dz = dz1;
        }
        if (rz !== 0) {
          const cos = Math.cos(rz);
          const sin = Math.sin(rz);
          const dx1 = dx * cos - dy * sin;
          const dy1 = dx * sin + dy * cos;
          dx = dx1;
          dy = dy1;
        }

        return projectVec(cx + dx, cy + dy, cz + dz, cWidth, cHeight, camY, zoom);
      };

      const v0 = rotateAndProject(x - w/2, y + h, z - d/2);
      const v1 = rotateAndProject(x + w/2, y + h, z - d/2);
      const v2 = rotateAndProject(x + w/2, y + h, z + d/2);
      const v3 = rotateAndProject(x - w/2, y + h, z + d/2);

      const v4 = rotateAndProject(x - w/2, y, z - d/2);
      const v5 = rotateAndProject(x + w/2, y, z - d/2);
      const v6 = rotateAndProject(x + w/2, y, z + d/2);
      const v7 = rotateAndProject(x - w/2, y, z + d/2);

      ctx.save();

      // Extract hue for shading
      const match = color.match(/hsl\((\d+)/);
      const hue = match ? parseInt(match[1], 10) : 200;

      const topColor = `hsl(${hue}, 85%, 65%)`;
      const leftColor = `hsl(${hue}, 78%, 51%)`;
      const rightColor = `hsl(${hue}, 74%, 42%)`;

      // Bottom face
      ctx.fillStyle = rightColor;
      ctx.beginPath();
      ctx.moveTo(v4.x, v4.y);
      ctx.lineTo(v5.x, v5.y);
      ctx.lineTo(v6.x, v6.y);
      ctx.lineTo(v7.x, v7.y);
      ctx.closePath();
      ctx.fill();

      // Left face
      ctx.fillStyle = leftColor;
      ctx.beginPath();
      ctx.moveTo(v3.x, v3.y);
      ctx.lineTo(v2.x, v2.y);
      ctx.lineTo(v6.x, v6.y);
      ctx.lineTo(v7.x, v7.y);
      ctx.closePath();
      ctx.fill();

      // Right face
      ctx.fillStyle = rightColor;
      ctx.beginPath();
      ctx.moveTo(v2.x, v2.y);
      ctx.lineTo(v1.x, v1.y);
      ctx.lineTo(v5.x, v5.y);
      ctx.lineTo(v6.x, v6.y);
      ctx.closePath();
      ctx.fill();

      // Top face
      ctx.fillStyle = topColor;
      ctx.beginPath();
      ctx.moveTo(v0.x, v0.y);
      ctx.lineTo(v1.x, v1.y);
      ctx.lineTo(v2.x, v2.y);
      ctx.lineTo(v3.x, v3.y);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    };

    // Draw Perfect ripple expansions
    const drawRipple = (
      ripple: { x: number; y: number; z: number; size: number; alpha: number },
      cWidth: number, cHeight: number, camY: number, zoom: number
    ) => {
      const size = ripple.size;
      const center = projectVec(ripple.x, ripple.y, ripple.z, cWidth, cHeight, camY, zoom);
      const angle = 30 * Math.PI / 180;
      const cos30 = Math.cos(angle);
      const sin30 = Math.sin(angle);

      const radiusX = size * Math.sqrt(2) * cos30 * zoom;
      const radiusY = size * Math.sqrt(2) * sin30 * zoom;

      ctx.save();
      ctx.strokeStyle = `rgba(255, 255, 255, ${ripple.alpha})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };

    // Primary requestAnimationFrame Tick
    const render = () => {
      const data = stateRef.current;
      const devicePixelRatio = window.devicePixelRatio || 1;
      const cWidth = canvas.width / devicePixelRatio;
      const cHeight = canvas.height / devicePixelRatio;

      // Adapt zoom scale depending on viewport size
      const defaultZoom = cWidth < 480 ? 1.55 : 2.05;
      
      let targetZoom = defaultZoom;
      if (data.gameState === 'SHOWCASE') {
        // Fit the entire tower by summing block heights
        const towerHeight = data.blocks.reduce((sum, b) => sum + b.height, 0) + 120;
        // Calculate the ideal zoom to fit this height within cHeight
        const idealZoom = (cHeight * 0.72) / towerHeight;
        // Limit zoom so it doesn't get ridiculously tiny or too zoomed in
        targetZoom = Math.max(0.35, Math.min(defaultZoom, idealZoom));
      }
      
      // Interpolate camera zoom smoothly
      data.cameraZoom += (targetZoom - data.cameraZoom) * 0.05;
      const zoom = data.cameraZoom;

      // Smoothly interpolate Camera Tracker (Y)
      data.cameraY += (data.targetCameraY - data.cameraY) * 0.085;

      // --- 1. Background Shift Gradient ---
      const activeHue = data.blocks.length > 0 
        ? data.blocks[data.blocks.length - 1].hue 
        : data.baseHue;
      
      // We calculate a skyHue that remains in the beautiful cyan-teal/misty range of the reference image
      // but oscillates slightly depending on the active game block hue
      const hueShift = ((activeHue % 30) - 15);
      const skyHue = (188 + hueShift + 360) % 360; 
      
      const grad = ctx.createLinearGradient(0, 0, 0, cHeight);
      // Soft misty blue-gray sky top (matches reference image beautifully)
      grad.addColorStop(0, `hsl(${skyHue}, 18%, 76%)`);      
      // Light transitional soft cyan/mist mid-sky
      grad.addColorStop(0.35, `hsl(${skyHue}, 22%, 65%)`);   
      // Ultra smooth transition zone (eliminates sharp horizon line completely)
      grad.addColorStop(0.55, `hsl(${skyHue}, 26%, 53%)`);   
      // Seamlessly flows into the rich teal water surface
      grad.addColorStop(0.65, `hsl(187, 34%, 43%)`);         
      // Deep sea bed watercolor dark teal
      grad.addColorStop(1, `hsl(189, 38%, 28%)`);            
      
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cWidth, cHeight);

      // Draw Drifting Clouds in the Sky (Toonish Hand-Painted Soft Watercolor Wash style)
      ctx.save();
      const elapsedSeconds = Date.now() / 1000;
      clouds.forEach((cloud) => {
        // Calculate the current horizontal coordinate based on continuous elapsed time
        const rawX = cloud.baseX + elapsedSeconds * cloud.speed * 40; // scale speed for a gorgeous slow drift
        const cloudX = ((rawX + 25) % 140) - 25; // wraps smoothly from -25 to 115
        
        const cx = (cloudX / 100) * cWidth;
        const cy = (cloud.y / 100) * cHeight;
        const baseRadius = 22 * cloud.scale;
        
        // Draw multiple overlapping, horizontally-stretched watercolor brush strokes
        const strokeCount = 5;
        for (let s = 0; s < strokeCount; s++) {
          ctx.save();
          // Gentle organic swaying offsets to emulate realistic hand-painted texture
          const offsetX = Math.sin(cloudX * 0.12 + s * 1.8) * 6 * cloud.scale;
          const offsetY = Math.cos(cloudX * 0.06 + s * 2.3) * 2.5 * cloud.scale;
          
          // Stretch horizontally and compress vertically to create the wispy streaks from the user's reference image
          const stretchX = (4.0 + s * 0.9) * cloud.scale;
          const stretchY = (0.75 - s * 0.1) * cloud.scale;
          
          ctx.translate(cx + offsetX, cy + offsetY);
          ctx.scale(stretchX, stretchY);
          
          // Soft radial gradient modeling a wet watercolor brush wash
          const cloudGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, baseRadius);
          const alphaVal = 0.05 + (0.04 / strokeCount); // highly layered & transparent
          
          cloudGrad.addColorStop(0, `rgba(255, 255, 255, ${alphaVal * 2.8})`);
          cloudGrad.addColorStop(0.25, `rgba(255, 255, 255, ${alphaVal * 1.8})`);
          cloudGrad.addColorStop(0.65, `rgba(255, 255, 255, ${alphaVal * 0.5})`);
          cloudGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          
          ctx.fillStyle = cloudGrad;
          ctx.beginPath();
          ctx.arc(0, 0, baseRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });
      ctx.restore();

      // --- 2. Update Moving Active Block ---
      if (data.gameState === 'PLAYING' && data.activeBlock) {
        const speed = 2.2 + Math.min(data.score * 0.09, 3.8); // progressively faster
        const active = data.activeBlock;

        if (active.axis === 'X') {
          active.x += speed * active.direction;
          // Reverse direction if hitting extreme bounds
          if (active.x > MOVEMENT_RANGE && active.direction > 0) active.direction = -1;
          if (active.x < -MOVEMENT_RANGE && active.direction < 0) active.direction = 1;
        } else {
          active.z += speed * active.direction;
          if (active.z > MOVEMENT_RANGE && active.direction > 0) active.direction = -1;
          if (active.z < -MOVEMENT_RANGE && active.direction < 0) active.direction = 1;
        }
      }

      // --- 3. Update Debris Slices ---
      data.fallingSlices.forEach((slice) => {
        slice.vy += slice.gravity;
        slice.x += slice.vx;
        slice.y += slice.vy;
        slice.z += slice.vz;
        
        slice.rx += slice.vrx;
        slice.ry += slice.vry;
        slice.rz += slice.vrz;
      });
      // Garbage collect out-of-bounds slices
      data.fallingSlices = data.fallingSlices.filter((slice) => slice.y > -220);

      // --- 4. Update Particle Spray ---
      data.particles.forEach((p) => {
        if (p.isSmoke) {
          p.x += p.vx;
          p.y += p.vy; 
          p.z += p.vz;
          p.size += 0.055; 
        } else {
          p.vy -= 0.12; 
          p.x += p.vx;
          p.y += p.vy;
          p.z += p.vz;
        }
        p.life++;
        p.alpha = Math.max(0, 1 - p.life / p.maxLife);
      });
      data.particles = data.particles.filter((p) => p.life < p.maxLife);

      // --- Spawning Chimney Smoke ---
      const isGameOverOrShowcase = data.gameState === 'GAME_OVER' || data.gameState === 'SHOWCASE';
      if (isGameOverOrShowcase && data.blocks.length > 0 && Math.random() < 0.065) {
        const topBlockForSmoke = data.blocks[data.blocks.length - 1];
        if (topBlockForSmoke.id !== 'foundation') {
          const w = topBlockForSmoke.width;
          const d = topBlockForSmoke.depth;
          const chimScale = Math.min(w, d) / MAX_SIZE;
          const clampedScale = Math.max(0.35, Math.min(1.1, chimScale));
          const chimHeight = 13 * clampedScale;

          const smokeX = topBlockForSmoke.x + w * 0.22;
          const smokeZ = topBlockForSmoke.z - d * 0.22;
          const smokeY = topBlockForSmoke.y + topBlockForSmoke.height + Math.min(w, d) * 0.44 * 0.45 + chimHeight;

          data.particles.push({
            id: Math.random().toString(),
            x: smokeX,
            y: smokeY,
            z: smokeZ,
            vx: 0.15 + Math.random() * 0.22, 
            vy: 0.35 + Math.random() * 0.32,  
            vz: -0.12 - Math.random() * 0.18, 
            color: 'rgba(235, 237, 240, 0.45)', 
            size: 2.2 + Math.random() * 2.8,
            alpha: 1,
            life: 0,
            maxLife: 60 + Math.floor(Math.random() * 30),
            isSmoke: true,
          });
        }
      }

      // --- 5. Update Perfect Ripples ---
      data.perfectRipples.forEach((ripple) => {
        ripple.size += 3.2;
        ripple.alpha = Math.max(0, 1 - ripple.size / ripple.maxZ);
      });
      data.perfectRipples = data.perfectRipples.filter((r) => r.alpha > 0);

      // --- 6. RENDER ALL OBJECTS ---

      // Draw beautiful sea water ripples around the tower foundation base
      ctx.save();
      const center = projectVec(0, -60, 0, cWidth, cHeight, data.cameraY, zoom);

      // Helper to draw an isometric rounded rectangle by sampling points in 3D and projecting them
      const drawIsoRoundedRect = (
        cx: number, cy: number, cz: number,
        w: number, d: number, radius: number,
        color: string, lWidth: number
      ) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lWidth;
        ctx.beginPath();
        
        const halfW = w / 2;
        const halfD = d / 2;
        const r = Math.min(radius, halfW, halfD);

        const getCornerPts = (xSign: number, zSign: number, startAngle: number, endAngle: number) => {
          const pts = [];
          const steps = 8;
          const arcCX = cx + xSign * (halfW - r);
          const arcCZ = cz + zSign * (halfD - r);
          for (let i = 0; i <= steps; i++) {
            const theta = startAngle + (endAngle - startAngle) * (i / steps);
            const px = arcCX + r * Math.cos(theta);
            const pz = arcCZ + r * Math.sin(theta);
            const screenPt = projectVec(px, cy, pz, cWidth, cHeight, data.cameraY, zoom);
            pts.push(screenPt);
          }
          return pts;
        };

        const c1 = getCornerPts(-1, -1, Math.PI, Math.PI * 1.5);
        const c2 = getCornerPts(1, -1, Math.PI * 1.5, Math.PI * 2);
        const c3 = getCornerPts(1, 1, 0, Math.PI * 0.5);
        const c4 = getCornerPts(-1, 1, Math.PI * 0.5, Math.PI);

        const allPts = [...c1, ...c2, ...c3, ...c4];
        if (allPts.length > 0) {
          ctx.moveTo(allPts[0].x, allPts[0].y);
          for (let i = 1; i < allPts.length; i++) {
            ctx.lineTo(allPts[i].x, allPts[i].y);
          }
          ctx.closePath();
          ctx.stroke();
        }
      };

      const rippleTime = Date.now();

      // 1. Static/breathing edge foam hugging the foundation walls (half-width = 50)
      const foamBreath = Math.sin(rippleTime / 800) * 0.8;
      const contactS = 50 + foamBreath;
      
      // Multi-layer glowing contact foam
      drawIsoRoundedRect(0, -60, 0, contactS * 2, contactS * 2, 8, `rgba(255, 255, 255, 0.45)`, 5 * zoom);
      drawIsoRoundedRect(0, -60, 0, contactS * 2, contactS * 2, 8, `rgba(255, 255, 255, 0.8)`, 1.5 * zoom);

      // 2. Beautiful expanding waves that fade out as they get farther away (matching the reference image)
      const numRipples = 4;
      for (let i = 0; i < numRipples; i++) {
        const progress = ((rippleTime / 7200) + i / numRipples) % 1;
        // Size expands from 50 (foundation) up to 220 (deep water)
        const S = 50 + 170 * progress;
        
        // Opacity drops as the ripple expands further away
        let alpha = 1 - progress;
        alpha = Math.pow(alpha, 1.8); // non-linear softer decay

        const baseOpacity = 0.55 * alpha;
        if (baseOpacity <= 0.01) continue;

        // Corner radius expands as the wave goes outwards (becoming more circular)
        const cornerRadius = 8 + (S * 0.55 - 8) * progress;

        // Multi-layered visual watercolor bloom (glow)
        // Layer 1: Wide, very soft ambient bloom
        drawIsoRoundedRect(
          0, -60, 0,
          S * 2, S * 2, cornerRadius,
          `rgba(224, 242, 254, ${baseOpacity * 0.28})`,
          14 * zoom
        );

        // Layer 2: Medium semi-opaque body
        drawIsoRoundedRect(
          0, -60, 0,
          S * 2, S * 2, cornerRadius,
          `rgba(255, 255, 255, ${baseOpacity * 0.65})`,
          6 * zoom
        );

        // Layer 3: Sharp bright core line
        drawIsoRoundedRect(
          0, -60, 0,
          S * 2, S * 2, cornerRadius,
          `rgba(255, 255, 255, ${baseOpacity * 1.0})`,
          1.5 * zoom
        );
      }

      ctx.restore();

      // Draw standard base pillar pedestal
      const baseHue = data.baseHue;
      drawBuildingBlock(0, -60, 0, MAX_SIZE + 20, 60, MAX_SIZE + 20, (baseHue + 340) % 360, cWidth, cHeight, data.cameraY, zoom, 0.45, true);

      // Draw Stack Blocks from bottom to top (Single Pass for correct isometric occlusion)
      const startIdx = data.gameState === 'SHOWCASE' ? 0 : Math.max(0, data.blocks.length - 24);
      for (let i = startIdx; i < data.blocks.length; i++) {
        const block = data.blocks[i];
        
        const distanceFromTop = data.blocks.length - 1 - i;
        let opacity = 1.0;
        if (data.gameState !== 'SHOWCASE' && distanceFromTop > 14) {
          opacity = Math.max(0, 1.0 - (distanceFromTop - 14) / 8);
        }

        const isFoundation = block.id === 'foundation';
        const isRoof = i === data.blocks.length - 1;

        // 1. Draw solid block body
        drawBuildingBlock(
          block.x, block.y, block.z,
          block.width, block.height, block.depth,
          block.hue, cWidth, cHeight,
          data.cameraY, zoom, opacity,
          isFoundation,
          isRoof,
          false,
          i,
          false // Draw solid block
        );

        // 2. Draw BACK decorations of this level (behind any blocks above)
        drawBuildingBlock(
          block.x, block.y, block.z,
          block.width, block.height, block.depth,
          block.hue, cWidth, cHeight,
          data.cameraY, zoom, opacity,
          isFoundation,
          isRoof,
          false,
          i,
          'back' // Draw back decorations
        );

        // 3. Draw FRONT decorations of the level BELOW (which are in front of this level's body)
        if (i - 1 >= startIdx) {
          const prevBlock = data.blocks[i - 1];
          const prevDistanceFromTop = data.blocks.length - 1 - (i - 1);
          let prevOpacity = 1.0;
          if (data.gameState !== 'SHOWCASE' && prevDistanceFromTop > 14) {
            prevOpacity = Math.max(0, 1.0 - (prevDistanceFromTop - 14) / 8);
          }
          drawBuildingBlock(
            prevBlock.x, prevBlock.y, prevBlock.z,
            prevBlock.width, prevBlock.height, prevBlock.depth,
            prevBlock.hue, cWidth, cHeight,
            data.cameraY, zoom, prevOpacity,
            prevBlock.id === 'foundation',
            false,
            false,
            i - 1,
            'front' // Draw front decorations
          );
        }
      }

      // 4. Finally, draw the FRONT decorations of the topmost block (since nothing is above it to cover them)
      if (data.blocks.length > 0) {
        const topIdx = data.blocks.length - 1;
        if (topIdx >= startIdx) {
          const topBlock = data.blocks[topIdx];
          let topOpacity = 1.0;
          const topDistanceFromTop = 0;
          if (data.gameState !== 'SHOWCASE' && topDistanceFromTop > 14) {
            topOpacity = Math.max(0, 1.0 - (topDistanceFromTop - 14) / 8);
          }
          drawBuildingBlock(
            topBlock.x, topBlock.y, topBlock.z,
            topBlock.width, topBlock.height, topBlock.depth,
            topBlock.hue, cWidth, cHeight,
            data.cameraY, zoom, topOpacity,
            topBlock.id === 'foundation',
            true,
            false,
            topIdx,
            'front' // Draw front decorations of top block
          );
        }
      }

      // Draw Perfect Ripples
      data.perfectRipples.forEach((ripple) => {
        drawRipple(ripple, cWidth, cHeight, data.cameraY, zoom);
      });

      // Draw Active Moving Block (Styled as scaffolding floating house)
      if (data.gameState === 'PLAYING' && data.activeBlock) {
        const active = data.activeBlock;
        const currentLevel = data.blocks.length;
        const nextHue = (data.baseHue + currentLevel * data.hueStep) % 360;
        const topBlock = data.blocks[data.blocks.length - 1];
        const activeY = topBlock ? (topBlock.y + topBlock.height) : 0;
        const activeHeight = BLOCK_HEIGHT;

        drawBuildingBlock(
          active.x, activeY, active.z,
          active.width, activeHeight, active.depth,
          nextHue, cWidth, cHeight,
          data.cameraY, zoom, 0.88,
          false,
          false, // Not roof when moving (it will become roof once placed if it's the top level)
          true,  // isMoving
          currentLevel
        );
      }

      // Draw Debris Pieces
      data.fallingSlices.forEach((slice) => {
        drawRotatedCuboid(slice, cWidth, cHeight, data.cameraY, zoom);
      });

      // Draw Particles
      data.particles.forEach((p) => {
        const pScreen = projectVec(p.x, p.y, p.z, cWidth, cHeight, data.cameraY, zoom);
        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        // Draw tiny particle diamonds
        ctx.moveTo(pScreen.x, pScreen.y - p.size);
        ctx.lineTo(pScreen.x + p.size, pScreen.y);
        ctx.lineTo(pScreen.x, pScreen.y + p.size);
        ctx.lineTo(pScreen.x - p.size, pScreen.y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });

      // Loop
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Update canvas resolution dynamically for High-DPI screens
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // Scale size of canvas elements properly
    canvas.width = dimensions.width * devicePixelRatio;
    canvas.height = dimensions.height * devicePixelRatio;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;

    ctx.scale(devicePixelRatio, devicePixelRatio);
  }, [dimensions]);

  // Action listeners (Touch, Mouse click, or Spacebar key)
  const handleAction = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    performStack();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault(); // prevent scrolling
        performStack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      ref={containerRef}
      id="game-canvas-container"
      className="relative w-full h-full cursor-pointer select-none overflow-hidden outline-none bg-slate-50"
      onMouseDown={handleAction}
      onTouchStart={handleAction}
    >
      <canvas ref={canvasRef} className="block w-full h-full" id="stack-canvas" />
    </div>
  );
}
