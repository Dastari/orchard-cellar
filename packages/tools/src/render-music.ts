/**
 * Offline listening renders for tracker songs. Runs every `packages/assets/music/*.song.json`
 * (or the names given as arguments) through the runtime synth in headless Chrome's
 * OfflineAudioContext, writes 16-bit stereo WAVs to `output/music-renders/`
 * (git-ignored — never commit them) and prints peak/RMS/clipping statistics.
 *
 * Run: npm run music:render [-- theme_title theme_night] [--passes=2] [--stems]
 * `--stems` also renders every channel solo (reported, WAVs as <song>~<index>-<patch>.wav)
 * so channel balance can be judged by numbers as well as by ear.
 * Requires a Chrome/Chromium executable (CHROME_BIN, default /usr/bin/google-chrome).
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';
import { createServer } from 'vite';

const SAMPLE_RATE = 44_100;
const root = resolve(import.meta.dirname, '../../..');
const musicRoot = resolve(root, 'packages/assets/music');
const outputRoot = resolve(root, 'output/music-renders');
const passes = Math.max(1, Number(process.argv.find((arg) => arg.startsWith('--passes='))?.split('=')[1] ?? 1));
const stems = process.argv.includes('--stems');
const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const available = (await readdir(musicRoot)).filter((name) => name.endsWith('.song.json')).map((name) => name.replace(/\.song\.json$/u, '')).sort();
const songs = requested.length > 0 ? requested : available;
for (const song of songs) if (!available.includes(song)) throw new Error(`Unknown song ${song}; available: ${available.join(', ')}`);
interface RenderJob { readonly key: string; readonly song: string; readonly solo: number | null }
const jobs: RenderJob[] = [];
for (const song of songs) {
  jobs.push({ key: song, song, solo: null });
  if (!stems) continue;
  const source = JSON.parse(await readFile(resolve(musicRoot, `${song}.song.json`), 'utf8')) as { channels: { patch: string }[] };
  source.channels.forEach((channel, index) => jobs.push({ key: `${song}~${index}-${channel.patch}`, song, solo: index }));
}

function wav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const pending = new Map<string, (result: { stats: Record<string, unknown>; pcm: Buffer }) => void>();
const page = `<!doctype html><html><body><script type="module">
import '/packages/tools/src/render-music-entry.ts';
for (const job of ${JSON.stringify(jobs)}) {
  try {
    const song = await (await fetch('/packages/assets/music/' + job.song + '.song.json')).json();
    const rendered = job.solo === null ? song : { ...song, name: job.key, channels: [song.channels[job.solo]] };
    await window.renderSong(rendered, ${SAMPLE_RATE}, ${passes}, '/__music-result/' + encodeURIComponent(job.key));
  } catch (error) {
    await fetch('/__music-result/' + encodeURIComponent(job.key) + '?stats=' + encodeURIComponent(JSON.stringify({ error: String(error?.stack ?? error) })), { method: 'POST' });
  }
}
</script></body></html>`;

const server = await createServer({
  root, configFile: false, logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
  plugins: [{ name: 'offline-music-render', configureServer(dev) {
    dev.middlewares.use((request, response, next) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname === '/__music-render') {
        response.setHeader('Content-Type', 'text/html');
        response.end(page);
      } else if (url.pathname.startsWith('/__music-result/') && request.method === 'POST') {
        const name = decodeURIComponent(url.pathname.slice('/__music-result/'.length));
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          response.end('ok');
          pending.get(name)?.({ stats: JSON.parse(url.searchParams.get('stats') ?? '{}') as Record<string, unknown>, pcm: Buffer.concat(chunks) });
        });
      } else next();
    });
  } }],
});
const profile = await mkdtemp(resolve(tmpdir(), 'orchard-music-render-'));
await server.listen();
const address = server.httpServer?.address();
if (address === null || address === undefined || typeof address === 'string') throw new Error('render server address unavailable');
const results = jobs.map(({ key: name }) => new Promise<{ stats: Record<string, unknown>; pcm: Buffer }>((resolveResult) => pending.set(name, resolveResult)));
const chrome = spawn(process.env['CHROME_BIN'] ?? '/usr/bin/google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
  '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${profile}`,
  `http://127.0.0.1:${address.port}/__music-render`,
], { stdio: 'ignore' });
let timer: ReturnType<typeof setTimeout> | undefined;
try {
  await mkdir(outputRoot, { recursive: true });
  const summary: Record<string, unknown>[] = [];
  for (const [index, { key: name }] of jobs.entries()) {
    const result = await Promise.race([results[index]!, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Offline render of ${name} timed out`)), 300_000);
    })]);
    clearTimeout(timer);
    if ('error' in result.stats) throw new Error(`${name}: ${String(result.stats['error'])}`);
    const path = resolve(outputRoot, `${name}.wav`);
    await writeFile(path, wav(result.pcm, SAMPLE_RATE));
    summary.push({ ...result.stats, wav: relative(root, path) });
  }
  console.table(summary);
  const failures = summary.filter((entry) => Number(entry['clippedSamples']) > 0 || Number(entry['peakDbfs']) > -0.5);
  if (failures.length > 0) {
    console.error(`Clipping or near-full-scale peaks in: ${failures.map((entry) => String(entry['song'])).join(', ')}`);
    process.exitCode = 1;
  }
} finally {
  if (timer !== undefined) clearTimeout(timer);
  chrome.kill();
  await server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
