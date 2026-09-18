1. **Modify `AssetBin.tsx` for web file picker fallback**:
   - Add a hidden `<input type="file" multiple accept="video/*,audio/*" />`.
   - Update `handleImportMedia` to first check if it's running in Tauri (by checking `window.__TAURI_INTERNALS__`). If not, programmatically click the hidden file input.
   - Handle the `onChange` event of the file input: read the files, generate object URLs, get duration using an invisible `<video>`/`<audio>` element, and add them to the media pool.
   - For web assets, generating a mock fingerprint using filename + size + lastModified.
   - Add "Add to Timeline" button on the asset cards. This requires wiring up a click handler that calls `addClipToTrack` or similar from the timeline store. We will probably add it to the active track or the first track that matches the asset type.

2. **Modify `TimelineTrackEditor.tsx` for drag-and-drop support**:
   - Allow dragging assets from the `AssetBin`. Make the asset cards in `AssetBin` draggable, and set data like `asset.id`.
   - Add `onDragOver` and `onDrop` handlers to the timeline track areas.
   - When dropped, calculate the drop time based on X offset and zoom level, and create a clip using the asset data, adding it to the track.

3. **Modify `nativeBridge.ts` or add helper**:
   - Make sure `importMediaFile` behaviour correctly reflects the changes if we want to handle web mode purely in the components. However, modifying `AssetBin` to handle the web `<input>` directly as requested in R9.2 is better ("In `AssetBin.tsx`, add an HTML5 file input fallback (`<input type="file" />`) for browser environments; generate valid media assets with ObjectURLs/duration").

4. **Add tests for new behavior**:
   - Test that clicking import on web mode triggers the file input.
   - Test adding an asset to the timeline (Add to Timeline button).

5. **Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.**
   - Run `npm run build`, `npm run test`, and `npm run lint`.

6. **Submit**.
