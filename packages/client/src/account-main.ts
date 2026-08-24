import {
  localProfileWorldUrl,
  readLocalProfiles,
  rememberLocalProfile,
  validLocalProfileName,
} from './account-profile.js';
import './style.css';

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');
const inputElement = document.querySelector<HTMLInputElement>('#account-name');
if (canvasElement === null || inputElement === null) throw new Error('Missing account canvas controls');
const canvas: HTMLCanvasElement = canvasElement;
const input: HTMLInputElement = inputElement;
const canvasContext = canvas.getContext('2d');
if (canvasContext === null) throw new Error('Canvas 2D unavailable');
const context: CanvasRenderingContext2D = canvasContext;
context.imageSmoothingEnabled = false;

let profiles = readLocalProfiles(localStorage);
let selected = Math.max(0, profiles.names.findIndex((name) => name === profiles.lastUsed));
let message = profiles.names.length === 0 ? 'NAME YOUR FIRST FARMER' : 'CHOOSE A FARMER OR TYPE A NEW NAME';

function resize(): void {
  const scale = Math.max(1, Math.floor(Math.min(innerWidth / 480, innerHeight / 270)));
  canvas.style.width = `${480 * scale}px`;
  canvas.style.height = `${270 * scale}px`;
  const rect = canvas.getBoundingClientRect();
  input.style.left = `${rect.left + 102 * scale}px`;
  input.style.top = `${rect.top + 202 * scale}px`;
  input.style.width = `${276 * scale}px`;
  input.style.height = `${20 * scale}px`;
}

function launch(name: string): void {
  profiles = rememberLocalProfile(localStorage, name);
  location.assign(localProfileWorldUrl(profiles.lastUsed ?? name, location.origin));
}

function drawText(text: string, x: number, y: number, color = '#f7e7b2', align: CanvasTextAlign = 'left'): void {
  context.fillStyle = color;
  context.textAlign = align;
  context.font = '8px monospace';
  context.fillText(text, x, y);
}

function render(): void {
  context.fillStyle = '#527b48';
  context.fillRect(0, 0, 480, 270);
  context.fillStyle = '#648e52';
  for (let y = 9; y < 270; y += 29) {
    for (let x = 7 + (y % 4) * 13; x < 480; x += 47) context.fillRect(x, y, 2, 3);
  }
  context.fillStyle = '#2b1d0e';
  context.fillRect(58, 25, 364, 222);
  context.fillStyle = '#d6b978';
  context.fillRect(62, 29, 356, 214);
  context.fillStyle = '#f0d89a';
  context.fillRect(67, 34, 346, 204);

  drawText('ORCHARD & CELLAR', 240, 55, '#6f451f', 'center');
  drawText('LOCAL FRIENDS PREVIEW', 240, 68, '#91672e', 'center');
  drawText(message, 240, 83, '#6f451f', 'center');

  const visibleStart = Math.max(0, Math.min(selected - 2, profiles.names.length - 5));
  const visible = profiles.names.slice(visibleStart, visibleStart + 5);
  if (visible.length === 0) drawText('NO SAVED FARMERS YET', 240, 116, '#91672e', 'center');
  for (const [index, name] of visible.entries()) {
    const absolute = visibleStart + index;
    const y = 96 + index * 20;
    context.fillStyle = absolute === selected ? '#8b5a2b' : '#c9a96b';
    context.fillRect(102, y - 11, 276, 16);
    drawText(`${absolute === selected ? '> ' : '  '}${name.toUpperCase()}`, 111, y, absolute === selected ? '#ffe98a' : '#5b3d22');
  }

  drawText('NEW FARMER', 102, 198, '#6f451f');
  context.fillStyle = '#c9a96b';
  context.fillRect(102, 202, 276, 20);
  const typed = input.value;
  drawText((typed || 'TYPE 3-20 CHARACTERS').toUpperCase(), 110, 215, typed ? '#3f2d25' : '#916f4d');
  if (document.activeElement === input && Math.floor(performance.now() / 530) % 2 === 0) {
    const caretX = Math.min(366, 110 + typed.length * 5);
    context.fillStyle = '#3f2d25';
    context.fillRect(caretX, 207, 1, 9);
  }
  drawText('ARROWS SELECT  ENTER CONTINUE  N NEW', 240, 232, '#6f451f', 'center');
  drawText('LOCAL TOKEN ACCOUNT - DISCORD LOGIN COMES IN M6', 240, 241, '#91672e', 'center');
  requestAnimationFrame(render);
}

function submit(): void {
  const name = input.value.trim();
  if (name.length > 0) {
    if (!validLocalProfileName(name)) {
      message = 'USE 3-20 LETTERS, NUMBERS, SPACES, - OR APOSTROPHE';
      return;
    }
    launch(name);
    return;
  }
  const chosen = profiles.names[selected];
  if (chosen === undefined) {
    input.focus();
    message = 'TYPE A FARMER NAME FIRST';
    return;
  }
  launch(chosen);
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => {
  if (document.activeElement === input && event.key !== 'Escape') {
    if (event.key === 'Enter') submit();
    return;
  }
  if (event.key === 'ArrowUp' && profiles.names.length > 0) {
    selected = (selected - 1 + profiles.names.length) % profiles.names.length;
    event.preventDefault();
  } else if (event.key === 'ArrowDown' && profiles.names.length > 0) {
    selected = (selected + 1) % profiles.names.length;
    event.preventDefault();
  } else if (event.key.toLowerCase() === 'n') {
    input.focus();
  } else if (event.key === 'Enter') {
    submit();
  } else if (event.key === 'Escape') {
    input.value = '';
    input.blur();
    message = 'CHOOSE A FARMER OR TYPE A NEW NAME';
  }
});
canvas.addEventListener('pointerdown', (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * 480 / rect.width;
  const y = (event.clientY - rect.top) * 270 / rect.height;
  if (x >= 102 && x <= 378 && y >= 202 && y <= 222) {
    input.focus();
    return;
  }
  if (x < 102 || x > 378 || y < 85 || y > 190) return;
  const visibleStart = Math.max(0, Math.min(selected - 2, profiles.names.length - 5));
  const row = Math.floor((y - 85) / 20);
  const next = visibleStart + row;
  if (profiles.names[next] !== undefined) {
    selected = next;
    input.value = '';
    input.blur();
  }
});
input.addEventListener('input', () => {
  message = validLocalProfileName(input.value.trim()) ? 'PRESS ENTER TO CREATE OR CONTINUE' : 'TYPE A NEW FARMER NAME';
});

resize();
render();
