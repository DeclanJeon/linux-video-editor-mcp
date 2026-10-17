# Linux Video Editor MCP

A local MCP server for basic video editing on Linux, powered by FFmpeg. It provides a small set of editing tools to MCP-compatible agents such as Codex. It is an independent Linux implementation, **not** Higgsfield's official editor or a reverse-engineered copy of it.

## Requirements

- Linux
- Node.js 18+
- FFmpeg with `libx264`, AAC, MP3 (`libmp3lame`), and the `subtitles` filter enabled
- An MCP client that supports stdio servers

`ffprobe` is optional. Media inspection falls back to FFmpeg's input report.

## Install

```bash
git clone https://github.com/DeclanJeon/linux-video-editor-mcp.git
cd linux-video-editor-mcp
npm ci
```

Register it globally with Codex:

```bash
codex mcp add linux-video-editor -- node "$HOME/path/to/linux-video-editor-mcp/server.js"
```

Replace the example path with the actual clone location. By default the server only reads and writes under `~/Videos`. To select another workspace, set `VIDEO_MCP_ROOT` in the MCP server environment. Restart Codex after registering.

## Tools

- `video_probe` — report media format, duration, and stream information.
- `trim_video` — cut a time range and encode a new MP4 (`high`, `medium`, or `small` quality).
- `extract_audio` — extract audio to MP3 (128, 192, or 320 kbps).
- `burn_subtitles` — burn an SRT subtitle file into a new MP4.

All paths are relative to the configured workspace. Outputs must use the required file extension, must be in an existing directory, and cannot overwrite existing files. Inputs are left unchanged. Video encoding can take time and CPU, especially for large files.

## Development / smoke test

```bash
node --check server.js
npm start
```

The MCP server communicates over stdio; do not print logs to stdout. A client can initialize the server and call `tools/list` to verify tool discovery.

## Limitations

This is a deliberately small local editing toolkit, not a full timeline editor. It does not provide a graphical UI, video generation, cloud uploads, or Higgsfield account integration. Codec/filter availability depends on the local FFmpeg build. The subtitle filter rejects unsupported path characters to avoid FFmpeg filter-string parsing issues.

## License

MIT. See [LICENSE](LICENSE).
