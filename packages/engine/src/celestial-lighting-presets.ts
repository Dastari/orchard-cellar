/** Art direction for the game's 28-day year, independent of real-world latitude. */
export const CELESTIAL_PRESET = {
  seasons: [
    { sunrise: 6, sunset: 18, sunAltitude: 50, moonAltitude: 50 },
    { sunrise: 5, sunset: 21, sunAltitude: 75, moonAltitude: 35 },
    { sunrise: 6, sunset: 18, sunAltitude: 50, moonAltitude: 50 },
    { sunrise: 8, sunset: 16, sunAltitude: 25, moonAltitude: 65 },
  ],
  twilightHours: 0.75,
  nightFloor: { r: 20, g: 20, b: 32 },
  diffuseDay: { r: 174, g: 190, b: 211 },
  horizonSun: { r: 255, g: 177, b: 112 },
  highSun: { r: 255, g: 255, b: 255 },
  // Spectral moonlight: retain subdued red/green exposure while lifting blue
  // enough to read as luminous illumination against the dark diffuse floor.
  moon: { r: 105, g: 118, b: 255 },
  moonStrength: 0.78,
  // Scattered moonlight keeps sheltered ground deep blue rather than black.
  // The direct component still determines the approved unoccluded moon colour.
  moonDiffuseStrength: 0.65,
  cloudDirectLoss: 0.75,
  cloudDiffuseLoss: 0.12,
} as const;
