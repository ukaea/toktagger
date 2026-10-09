"use client";

export interface MarkerProps {
  color: string;
}

const MARKER_VIEWBOX = "0 0 24 24";

// Each marker mirrors how its annotation type renders on the plot, so it doubles as a legend
export const TimePointMarker = ({ color }: MarkerProps) => (
  <svg width="10" height="20" viewBox={MARKER_VIEWBOX}>
    <line x1="12" y1="1" x2="12" y2="40" stroke={color} strokeWidth="4" />
  </svg>
);

export const TimeRegionMarker = ({ color }: MarkerProps) => (
  <svg width="20" height="20" viewBox={MARKER_VIEWBOX}>
    <rect x="6" y="6" width="12" height="20" rx="2" fill={color} />
  </svg>
);

export const BoundingBoxMarker = ({ color }: MarkerProps) => (
  <svg width="20" height="20" viewBox={MARKER_VIEWBOX}>
    <rect
      x="3"
      y="5"
      width="18"
      height="14"
      rx="1"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
    />
  </svg>
);

export const PolygonMarker = ({ color }: MarkerProps) => (
  <svg width="20" height="20" viewBox={MARKER_VIEWBOX}>
    <polygon
      points="12,2 22,9.5 18,21 6,21 2,9.5"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
  </svg>
);

export const PointMarker = ({ color }: MarkerProps) => (
  <svg width="20" height="20" viewBox={MARKER_VIEWBOX}>
    <circle
      cx="12"
      cy="12"
      r="6"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
    />
  </svg>
);

export const FrameLabelMarker = ({ color }: MarkerProps) => (
  <svg width="20" height="20" viewBox={MARKER_VIEWBOX}>
    <path
      d="M3 5h10l8 7-8 7H3z"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
  </svg>
);
