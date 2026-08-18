/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type GameState = 'START' | 'PLAYING' | 'SHOWCASE' | 'GAME_OVER';

export interface Block {
  id: string;
  // Position of the block (center or corner? Let's use corner or center. 
  // Let's use center position for easier overlap calculations)
  x: number;
  y: number; // height level in isometric coordinates
  z: number;
  
  // Dimensions
  width: number; // along X axis
  depth: number; // along Z axis
  height: number; // along Y axis (usually constant, e.g. 15)
  
  // Color properties
  color: string;
  hue: number;
}

export interface FallingSlice {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  color: string;
  
  // Physics
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  
  // Rotation
  rx: number;
  ry: number;
  rz: number;
  vrx: number;
  vry: number;
  vrz: number;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  isSmoke?: boolean;
}

export interface GameStats {
  score: number;
  highScore: number;
  perfectCombo: number;
}
