1. **Audio Workspace Components (R9.4)**
   - Create `src/components/ParametricEqView.tsx`: Build a visual 10-band EQ curve interactive editor. Wire the sliders to `parametricEqEngine.setBandGain`, etc. (Add unit tests asserting rendering and slider interactions).
   - Create `src/components/AudioWorkspace.tsx`: Build the full audio mixer view with track volume faders, the `ParametricEqView`, and a live stereo VU/LUFS meter (using the `loudness.ts` or `audioEngine.ts` APIs). (Add unit tests verifying component mounting and parameter synchronization).
2. **App.tsx Integration**
   - Modify `src/App.tsx` to conditionally render `AudioWorkspace` when `activeWorkspace === 'audio'`.
3. **Verification**
   - Run `npm run build`, `npm run test`, `npm run lint`.
4. **Pre-commit Steps**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
5. **Submit**
   - Submit the PR.
