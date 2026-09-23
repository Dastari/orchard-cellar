/** Module identities survive minification; checking function strings would not. */
export function chunkRuntimeBuildAudit(mode: string, moduleIds: readonly string[], requireGeneratorFree = false) {
  if (mode !== 'off' && mode !== 'shadow') throw new Error('chunk_runtime_activation_not_approved');
  const legacyModules = [...new Set(moduleIds.map(id=>id.replaceAll('\\','/').split('?')[0]!)
    .filter(id=>/\/packages\/(?:sim\/src\/(?:procedural-terrain|survival-world|map-compiler)[^/]*|engine\/src\/(?:terrain|live-map-runtime))\.ts$/u.test(id)))] .sort();
  if (requireGeneratorFree && legacyModules.length) throw new Error(`chunk_generator_retirement_incomplete: ${legacyModules.join(', ')}`);
  return {schema:1,mode,legacyModules,activationAllowed:false};
}
