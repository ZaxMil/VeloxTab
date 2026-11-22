# ⚡ VeloxTab

> **The fastest, ultra-minimalist multi-tab universal media player with PotPlayer's iconic borderless dark aesthetic and seamless File Takeover mode.**

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/ZaxMil/VeloxTab)
[![Tech](https://img.shields.io/badge/engine-Hardware--Accelerated%20GPU-00c853.svg)](https://github.com/ZaxMil/VeloxTab)

---

## 🌟 Features & Capabilities

### 🎨 Iconic PotPlayer Frameless Dark Aesthetics
- **Borderless dark chrome**, custom title bar with window controls, and floating auto-hiding playback controls inspired by PotPlayer.
- **Theme Switcher**: Choose between **PotPlayer Classic Dark**, **OLED Pure Black**, and **Midnight Navy**.

### ⚡ Multi-Tab Architecture & File Takeover
- **Multi-Tab Media**: Open Video (🎬), Audio (🎵), and Image (🖼️) files simultaneously across independent tabs.
- **Tab Pinning & Muting**: Pin frequently accessed media tabs and mute individual tab audio streams.
- **⇲ File Takeover Mode (`Tab` / `F10`)**: Dissolves the tab bar and expands the active media to 100% borderless window with zero chrome. Moving your cursor to the top edge smoothly peeks the tabs for instant switching.

### 🔊 10-Band Graphic Equalizer & Audio Powerhouse
- **10 Frequencies**: 32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz.
- **8 Presets**: Flat, Rock, Pop, Bass Boost, Treble Boost, Vocal/Dialogue, Cinema, Classical.
- **200% Volume Boost**: Overdrive with dynamic limiter to eliminate distortion/clipping.
- **Stereo Balance**: Real-time Left/Right channel panning.

### 🎬 Video Post-Processing Shaders & Controls
- **Real-time Color Filters**: Brightness (-100% to +100%), Contrast, Saturation (B&W to 200% Vivid), Hue Rotation, and hardware Sharpen filter.
- **Aspect Ratio Selector**: Auto, 16:9, 4:3, 21:9 Ultrawide, Fill Screen, Fit to Window.
- **A-B Segment Loop**: Set point A (`[`), set point B (`]`), and loop sub-frame segments seamlessly.
- **Frame Stepping**: Step forward 1 frame (`.`) or backward 1 frame (`,`).
- **PotPlayer-Style OSD**: Cyan-glowing on-screen display notifications for volume, seek, speed, aspect, and loop points.

### 💬 Advanced Subtitle Engine
- **Multi-Format Support**: WebVTT and SRT parser supporting color formatting, bold, italics, and ASS style tags.
- **Real-Time Offset Sync**: Adjust timing dynamically in +/- 50ms increments to fix out-of-sync audio/subs.
- **Subtitle Overlay**: Clean customizable subtitle renderer with customizable font size, outline, and positioning.

### 📋 Dockable Playlist & Filmstrip Gallery
- **Collapsible Playlist Drawer**: Slide-out panel with real-time search filtering, duration tags, shuffle, and 3-state repeat (Off / All / One).
- **Image Filmstrip**: Bottom thumbnail strip allowing rapid browsing of all images in the same folder.
- **Recursive Folder Discovery**: Drag and drop whole folders or select from menu to queue entire albums or seasons.
- **Session Restore**: Saves open tabs and playback positions on exit and offers to restore upon relaunch.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Tab` / `F10` | **Toggle File Takeover Mode** (collapse / expand tab bar) |
| `Space` | Play / Pause |
| `F` / `F11` | Fullscreen Toggle |
| `Ctrl + O` | Open Media File(s) |
| `Ctrl + Shift + O` | Open Entire Folder |
| `Ctrl + T` | New Media Tab |
| `Ctrl + W` | Close Current Tab |
| `Ctrl + Tab` | Switch to Next Tab |
| `Ctrl + Shift + Tab` | Switch to Previous Tab |
| `Ctrl + P` | Toggle Playlist Drawer |
| `E` | Toggle 10-Band Equalizer |
| `V` | Toggle Video Color Filters |
| `C` | Cycle Subtitle Tracks |
| `A` | Cycle Aspect Ratios |
| `[` / `]` | Subtitle Sync (-50ms / +50ms) OR A-B Repeat Markers |
| `.` / `,` | Frame Step Forward / Backward (1 frame) |
| `→` / `←` | Seek Forward / Backward (5s) |
| `↑` / `↓` | Volume Up / Down (5%) |
| `M` | Mute / Unmute |
| `R` | Rotate Image 90° clockwise |
| `0` | Reset Image Zoom & Pan to 1:1 |

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/ZaxMil/VeloxTab.git
cd VeloxTab

# Install dependencies
npm install

# Start the player
npm start
```

---

## 📜 License

MIT © [ZAX Mil](https://github.com/ZaxMil)
