import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { realpath, stat, lstat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile as execFileCb } from 'node:child_process';

const execFile = promisify(execFileCb);
const root = path.resolve(process.env.VIDEO_MCP_ROOT || path.join(process.env.HOME, 'Videos'));
const server = new McpServer({ name: 'linux-video-editor', version: '1.0.0' });

async function inRoot(input, { output = false } = {}) {
  const target = path.resolve(root, input);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Path must stay inside ' + root);
  const parent = output ? path.dirname(target) : target;
  const resolvedParent = await realpath(parent);
  if (resolvedParent !== root && !resolvedParent.startsWith(root + path.sep)) throw new Error('Symlinks outside the video workspace are not allowed');
  if (!output) {
    const info = await stat(target);
    if (!info.isFile()) throw new Error('Input must be a file');
  } else {
    try {
      await lstat(target);
      throw new Error('Output already exists; choose a new filename to avoid overwriting files');
    } catch (e) {
      if (e.message.startsWith('Output already exists')) throw e;
      if (e.code !== 'ENOENT') throw e;
    }
  }
  return target;
}

async function ffmpeg(args) {
  try {
    const { stdout, stderr } = await execFile('ffmpeg', ['-hide_banner', '-nostdin', ...args], { timeout: 600000, maxBuffer: 2 * 1024 * 1024 });
    return (stdout + stderr).trim().slice(-4000);
  } catch (e) {
    throw new Error((e.stderr || e.message).slice(-4000));
  }
}

server.registerTool('video_probe', {
  title: 'Inspect video or audio file',
  description: 'Return media metadata for a file inside the Videos workspace.',
  inputSchema: { file: z.string().min(1) }
}, async ({ file }) => {
  const full = await inRoot(file);
  // This FFmpeg build may not ship ffprobe; `ffmpeg -i` still reports stream/format metadata.
  let metadata = '';
  try {
    const result = await execFile('ffmpeg', ['-hide_banner', '-i', full], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
    metadata = result.stderr || result.stdout;
  } catch (e) {
    metadata = e.stderr || '';
    if (!metadata.includes('Input #')) throw new Error(metadata || e.message);
  }
  return { content: [{ type: 'text', text: metadata.trim() }] };
});

server.registerTool('trim_video', {
  title: 'Trim video',
  description: 'Cut a segment from a video in ~/Videos and save a new MP4. Start and duration are seconds; original is unchanged.',
  inputSchema: {
    input: z.string().min(1), output: z.string().min(1), start_seconds: z.number().min(0), duration_seconds: z.number().gt(0).max(86400),
    quality: z.enum(['high', 'medium', 'small']).default('medium')
  }
}, async ({ input, output, start_seconds, duration_seconds, quality }) => {
  const src = await inRoot(input);
  const dest = await inRoot(output, { output: true });
  if (path.extname(dest).toLowerCase() !== '.mp4') throw new Error('Output must use .mp4 extension');
  if (src === dest) throw new Error('Output cannot overwrite the input');
  const crf = { high: '18', medium: '23', small: '28' }[quality];
  await ffmpeg(['-y', '-ss', String(start_seconds), '-i', src, '-t', String(duration_seconds), '-c:v', 'libx264', '-preset', 'medium', '-crf', crf, '-c:a', 'aac', '-movflags', '+faststart', dest]);
  return { content: [{ type: 'text', text: `Trimmed video saved to ${dest}` }] };
});

server.registerTool('extract_audio', {
  title: 'Extract audio',
  description: 'Extract audio from a media file in ~/Videos and save it as MP3. Original is unchanged.',
  inputSchema: { input: z.string().min(1), output: z.string().min(1), bitrate: z.enum(['128k', '192k', '320k']).default('192k') }
}, async ({ input, output, bitrate }) => {
  const src = await inRoot(input);
  const dest = await inRoot(output, { output: true });
  if (path.extname(dest).toLowerCase() !== '.mp3') throw new Error('Output must use .mp3 extension');
  if (src === dest) throw new Error('Output cannot overwrite the input');
  await ffmpeg(['-y', '-i', src, '-vn', '-codec:a', 'libmp3lame', '-b:a', bitrate, dest]);
  return { content: [{ type: 'text', text: `Audio saved to ${dest}` }] };
});

server.registerTool('burn_subtitles', {
  title: 'Burn subtitles into video',
  description: 'Render an SRT subtitle file permanently into a video. Both files and output must stay in ~/Videos; saves a new MP4.',
  inputSchema: { input: z.string().min(1), subtitles: z.string().min(1), output: z.string().min(1) }
}, async ({ input, subtitles, output }) => {
  const src = await inRoot(input);
  const subs = await inRoot(subtitles);
  const dest = await inRoot(output, { output: true });
  if (path.extname(subs).toLowerCase() !== '.srt') throw new Error('Subtitles must be an .srt file');
  if (path.extname(dest).toLowerCase() !== '.mp4') throw new Error('Output must use .mp4 extension');
  if (dest === src || dest === subs) throw new Error('Output cannot overwrite an input');
  // ffmpeg's subtitles filter needs escaped paths; reject special filter syntax rather than risk injection.
  for (const p of [subs]) if (/[\\:'\[\],;]/.test(p)) throw new Error('Subtitle path contains characters unsupported by the FFmpeg subtitle filter');
  await ffmpeg(['-y', '-i', src, '-vf', `subtitles=${subs}:force_style='FontSize=22,Outline=2,Shadow=1'`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', dest]);
  return { content: [{ type: 'text', text: `Subtitled video saved to ${dest}` }] };
});

await mkdir(root, { recursive: true });
await server.connect(new StdioServerTransport());
