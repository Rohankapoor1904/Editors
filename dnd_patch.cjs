const fs = require('fs');
let code = fs.readFileSync('src/components/TimelineTrackEditor.tsx', 'utf8');

const importReplacement = `import { useTimelineStore } from '../store/timelineStore';
import { useMediaPoolStore } from '../store/mediaPool';
import { Clip } from '../types/timeline';`;
code = code.replace("import { useTimelineStore } from '../store/timelineStore';", importReplacement);

const trackDragHandlers = `
            <div
              key={track.id}
              style={{ height: \`\${track.height}px\` }}
              className="relative w-full border-b border-neutral-900/60"
              onDragOver={(e) => {
                e.preventDefault(); // Allow dropping
              }}
              onDrop={(e) => {
                e.preventDefault();
                const assetId = e.dataTransfer.getData("text/plain");
                if (!assetId) return;

                const { assets } = useMediaPoolStore.getState();
                const asset = assets.find(a => a.id === assetId);
                if (!asset) return;

                // Only allow dropping on matching track type
                if (asset.type !== track.type) return;

                const rect = e.currentTarget.getBoundingClientRect();
                const dropX = e.clientX - rect.left;
                const dropTimeSeconds = Math.max(0, dropX / zoomLevel);

                const durationParts = asset.duration.split(':').map(Number);
                const durationSeconds = (durationParts[0] || 0) * 3600 + (durationParts[1] || 0) * 60 + (durationParts[2] || 0);
                const clipDuration = secondsToRational(durationSeconds > 0 ? durationSeconds : 5);

                const newClip: Clip = {
                  id: \`clip_\${Date.now()}\`,
                  assetId: asset.id,
                  name: asset.name,
                  startOffset: secondsToRational(dropTimeSeconds),
                  sourceIn: secondsToRational(0),
                  sourceOut: clipDuration,
                  duration: clipDuration,
                };

                // Using the store's action
                useTimelineStore.getState().addClipToTrack(track.id, newClip);
              }}
            >`;
code = code.replace(
  '<div\n              key={track.id}\n              style={{ height: `${track.height}px` }}\n              className="relative w-full border-b border-neutral-900/60"\n            >',
  trackDragHandlers
);

fs.writeFileSync('src/components/TimelineTrackEditor.tsx', code);
