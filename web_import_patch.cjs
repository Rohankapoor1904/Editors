const fs = require('fs');
let code = fs.readFileSync('src/components/AssetBin.tsx', 'utf8');

// Insert useRef
code = code.replace("import React, { useState, useEffect } from 'react';", "import React, { useState, useEffect, useRef } from 'react';");
code = code.replace("import { useMediaPoolStore, MediaAsset } from '../store/mediaPool';", "import { useMediaPoolStore, MediaAsset } from '../store/mediaPool';\nimport { useTimelineStore } from '../store/timelineStore';\nimport { secondsToRational } from '../types/time';\nimport { Clip } from '../types/timeline';");

// Replace handleImportMedia
const targetHandleImport = `  const handleImportMedia = async () => {
    // A real file picker should allow selecting a file. Since native file dialog might
    // mock to a specific path right now in \`demo\` mode, we use a placeholder path to initiate it.
    const meta = await nativeBridge.importMediaFile('/path/to/test.mp4');
    if (meta) {
      const fingerprint = await nativeBridge.getFileFingerprint(meta.path);
      const isOffline = !(await nativeBridge.checkFileExists(meta.path));

      const newAsset: MediaAsset = {
        id: \`asset_\${Date.now()}\`,
        name: meta.filename,
        path: meta.path,
        type: meta.hasAudio && !meta.width ? 'audio' : 'video',
        duration: \`00:00:\${Math.floor(meta.durationSeconds).toString().padStart(2, '0')}\`,
        badge: meta.codec,
        fps: meta.fps ? String(meta.fps) : undefined,
        resolution: meta.width ? \`\${meta.width}x\${meta.height}\` : undefined,
        fingerprint,
        isOffline,
      };

      addAsset(newAsset);
    }
  };`;

const newHandleImport = `  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addClipToTrack, tracks } = useTimelineStore();

  const handleImportMedia = async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const meta = await nativeBridge.importMediaFile('');
      if (meta) {
        const fingerprint = await nativeBridge.getFileFingerprint(meta.path);
        const isOffline = !(await nativeBridge.checkFileExists(meta.path));

        const newAsset: MediaAsset = {
          id: \`asset_\${Date.now()}\`,
          name: meta.filename,
          path: meta.path,
          type: meta.hasAudio && !meta.width ? 'audio' : 'video',
          duration: \`00:00:\${Math.floor(meta.durationSeconds).toString().padStart(2, '0')}\`,
          badge: meta.codec,
          fps: meta.fps ? String(meta.fps) : undefined,
          resolution: meta.width ? \`\${meta.width}x\${meta.height}\` : undefined,
          fingerprint,
          isOffline,
        };

        addAsset(newAsset);
      }
    } else {
      // Web fallback
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isAudio = file.type.startsWith('audio/');
      const objectUrl = URL.createObjectURL(file);

      // Extract duration and dimensions
      const mediaElement = isAudio ? new Audio(objectUrl) : document.createElement('video');
      mediaElement.src = objectUrl;

      await new Promise((resolve) => {
        mediaElement.addEventListener('loadedmetadata', resolve, { once: true });
        mediaElement.addEventListener('error', resolve, { once: true }); // Fallback if it fails to load
      });

      const durationSeconds = mediaElement.duration || 0;
      let width, height;
      if (!isAudio) {
        width = (mediaElement as HTMLVideoElement).videoWidth;
        height = (mediaElement as HTMLVideoElement).videoHeight;
      }

      const newAsset: MediaAsset = {
        id: \`asset_\${Date.now()}_\${i}\`,
        name: file.name,
        path: objectUrl,
        type: isAudio ? 'audio' : 'video',
        duration: \`00:00:\${Math.floor(durationSeconds).toString().padStart(2, '0')}\`,
        badge: 'web',
        fps: undefined,
        resolution: width ? \`\${width}x\${height}\` : undefined,
        fingerprint: \`\${file.name}-\${file.size}-\${file.lastModified}\`,
        isOffline: false,
      };

      addAsset(newAsset);
    }

    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddToTimeline = (e: React.MouseEvent, asset: MediaAsset) => {
    e.stopPropagation();

    // Find a suitable track
    const targetTrack = tracks.find(t => t.type === asset.type);
    if (!targetTrack) {
      console.warn('No suitable track found for asset type', asset.type);
      return;
    }

    // Parse duration string back to seconds (basic implementation for the format 00:00:SS)
    const durationParts = asset.duration.split(':').map(Number);
    const durationSeconds = (durationParts[0] || 0) * 3600 + (durationParts[1] || 0) * 60 + (durationParts[2] || 0);

    const clipDuration = secondsToRational(durationSeconds > 0 ? durationSeconds : 5); // Default to 5s if unknown

    const newClip: Clip = {
      id: \`clip_\${Date.now()}\`,
      assetId: asset.id,
      name: asset.name,
      startOffset: secondsToRational(0), // Would normally be at playhead, but timeline track editor expects something
      sourceIn: secondsToRational(0),
      sourceOut: clipDuration,
      duration: clipDuration,
    };

    // Put it at playhead position, or max end of track
    let maxEnd = 0;
    for (const clip of targetTrack.clips) {
       const endSec = clip.startOffset.value / clip.startOffset.rate + clip.duration.value / clip.duration.rate;
       if (endSec > maxEnd) maxEnd = endSec;
    }

    newClip.startOffset = secondsToRational(maxEnd);

    addClipToTrack(targetTrack.id, newClip);
  };
`;
code = code.replace(targetHandleImport, newHandleImport);

// Add input element and update UI for Add to Timeline button and dragging

const inputElementHTML = `
      {/* Hidden file input for web fallback */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
        accept="video/*,audio/*"
      />
`;

code = code.replace('{/* Top Header */}', inputElementHTML + '\n      {/* Top Header */}');

// Dragging support
code = code.replaceAll(
  '<div\n                  key={asset.id}',
  '<div\n                  key={asset.id}\n                  draggable={true}\n                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", asset.id); }}'
);

code = code.replaceAll(
  '<div\n                key={asset.id}',
  '<div\n                key={asset.id}\n                draggable={true}\n                onDragStart={(e) => { e.dataTransfer.setData("text/plain", asset.id); }}'
);

const addToTimelineBtnHTML = `
                    <button
                      onClick={(e) => handleAddToTimeline(e, asset)}
                      className="absolute bottom-1 left-1 bg-dark-950/90 hover:bg-indigo-900 text-[9px] font-medium px-1.5 py-0.5 rounded text-indigo-300 border border-indigo-900/50 backdrop-blur z-20 flex items-center space-x-1 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="absolute bottom-1 right-1 bg-dark-950/90 text-[9px] font-mono px-1 py-0.5 rounded text-neutral-400 border border-subtle z-20">`;
code = code.replace('<span className="absolute bottom-1 right-1 bg-dark-950/90 text-[9px] font-mono px-1 py-0.5 rounded text-neutral-400 border border-subtle z-20">', addToTimelineBtnHTML);


const addToTimelineListBtnHTML = `
                  <button
                    onClick={(e) => handleAddToTimeline(e, asset)}
                    className="px-2 py-0.5 bg-dark-800 hover:bg-indigo-900 text-indigo-300 rounded text-[9px] border border-subtle hover:border-indigo-500/50 flex items-center space-x-1"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <span className="text-[10px] text-neutral-400 font-mono tabular-nums shrink-0 ml-2">`;
code = code.replace('<span className="text-[10px] text-neutral-400 font-mono tabular-nums shrink-0 ml-2">', addToTimelineListBtnHTML);

fs.writeFileSync('src/components/AssetBin.tsx', code);
